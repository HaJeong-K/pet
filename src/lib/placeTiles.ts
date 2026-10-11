// src/lib/placeTiles.ts
//
// 지도 데이터(공공데이터 장소·공원)를 "작은 칸" 단위로 나눠 받기 위한 계산(브라우저·서버 공용).
//
// 예전에는 내 위치 주변 반경 30km를 한 번에 받았습니다(서울은 1만 2천여 곳). 받는 양도 많았지만, 더 큰 문제는
// 화면이 다시 그려질 때마다 그 1만여 곳을 전부 훑는 것이었습니다(화면에는 수십 곳만 보이는데도).
// 이제 전국을 0.05도 칸(약 5.5km × 4.4km)으로 나누고, 지도에 보이는 칸과 기능이 실제로 쓰는 범위의 칸만 받습니다.
// 칸은 서로 겹치지 않아서(장소 하나는 정확히 한 칸에 속함) 같은 장소가 두 번 들어오지 않고, 주소가 칸마다
// 고정이라 CDN이 응답을 대신 돌려줍니다(같은 동네 사람들은 같은 칸을 씁니다).
//
// 예전 방식(src/lib/mapTile.ts의 반경 30km)은 지도를 아주 넓게 축소했을 때만 씁니다 — 그때는 칸이 수백 개라
// 칸 단위로 받는 것이 오히려 느립니다.

/** 칸 크기(도). 0.05도 ≈ 위도 5.5km × 경도 4.4km(우리나라 위도 기준) */
export const FINE_TILE_DEG = 0.05;

export type TileXY = { x: number; y: number };
export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };

/** 우리나라를 덮는 칸 번호 범위(위도 32~39.5, 경도 124~132.5). 이 밖의 칸은 서버가 빈 목록을 돌려줍니다. */
export const TILE_RANGE = { minX: 2480, maxX: 2650, minY: 640, maxY: 790 };

// 0.05로 나누면 2579.9999999996 같은 값이 나올 수 있어, 아주 작은 값을 더한 뒤 내림합니다(서버·브라우저가 같은 식을 씁니다).
const cell = (deg: number) => Math.floor(deg / FINE_TILE_DEG + 1e-9);

/** 좌표가 속한 칸 */
export function tileOf(lat: number, lng: number): TileXY {
  return { x: cell(lng), y: cell(lat) };
}

export const tileKey = (tile: TileXY) => `${tile.x}_${tile.y}`;

export function isValidTile(tile: TileXY): boolean {
  return Number.isInteger(tile.x) && Number.isInteger(tile.y)
    && tile.x >= TILE_RANGE.minX && tile.x <= TILE_RANGE.maxX && tile.y >= TILE_RANGE.minY && tile.y <= TILE_RANGE.maxY;
}

/** 칸이 덮는 범위 */
export function tileBounds(tile: TileXY): Bounds {
  return { swLat: tile.y * FINE_TILE_DEG, swLng: tile.x * FINE_TILE_DEG, neLat: (tile.y + 1) * FINE_TILE_DEG, neLng: (tile.x + 1) * FINE_TILE_DEG };
}

const KM_PER_LAT_DEG = 111;
const kmPerLngDeg = (lat: number) => 111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));

/** 범위를 사방으로 marginKm만큼 넓힙니다. */
export function expandBounds(bounds: Bounds, marginKm: number): Bounds {
  const midLat = (bounds.swLat + bounds.neLat) / 2;
  const dLat = marginKm / KM_PER_LAT_DEG, dLng = marginKm / kmPerLngDeg(midLat);
  return { swLat: bounds.swLat - dLat, swLng: bounds.swLng - dLng, neLat: bounds.neLat + dLat, neLng: bounds.neLng + dLng };
}

/** 가운데에서 반경 km를 덮는 네모 범위 */
export function boundsAround(center: { lat: number; lng: number }, km: number): Bounds {
  return expandBounds({ swLat: center.lat, swLng: center.lng, neLat: center.lat, neLng: center.lng }, km);
}

/** 그 범위에 걸치는 칸이 몇 개인지(칸 목록을 만들지 않고 셉니다 — 너무 넓은지 먼저 볼 때) */
export function countTilesForBounds(bounds: Bounds): number {
  const a = tileOf(bounds.swLat, bounds.swLng), b = tileOf(bounds.neLat, bounds.neLng);
  return Math.max(0, b.x - a.x + 1) * Math.max(0, b.y - a.y + 1);
}

/** 그 범위에 걸치는 칸 목록(우리나라 밖의 칸은 뺍니다) */
export function tilesForBounds(bounds: Bounds): TileXY[] {
  const a = tileOf(bounds.swLat, bounds.swLng), b = tileOf(bounds.neLat, bounds.neLng);
  const tiles: TileXY[] = [];
  for (let y = Math.max(a.y, TILE_RANGE.minY); y <= Math.min(b.y, TILE_RANGE.maxY); y++) {
    for (let x = Math.max(a.x, TILE_RANGE.minX); x <= Math.min(b.x, TILE_RANGE.maxX); x++) tiles.push({ x, y });
  }
  return tiles;
}

/** 가운데에서 반경 km 안에 걸치는 칸 목록 */
export function tilesForRadius(center: { lat: number; lng: number }, km: number): TileXY[] {
  return tilesForBounds(boundsAround(center, km));
}

/** 두 범위가 하나라도 겹치는지 */
export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.swLat <= b.neLat && a.neLat >= b.swLat && a.swLng <= b.neLng && a.neLng >= b.swLng;
}

/** 칸 가운데에서 한 점까지의 대략적인 거리(km) — 멀리 있는 칸부터 정리할 때 씁니다. */
export function tileDistanceKm(tile: TileXY, point: { lat: number; lng: number }): number {
  const lat = (tile.y + 0.5) * FINE_TILE_DEG, lng = (tile.x + 0.5) * FINE_TILE_DEG;
  const dy = (lat - point.lat) * KM_PER_LAT_DEG, dx = (lng - point.lng) * kmPerLngDeg(point.lat);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 좌표가 있는 항목들을 칸별로 나눠 담습니다(서버가 전체 목록을 한 번 나눠 두고, 요청마다 칸 하나를 꺼내 줍니다).
 * 좌표가 잘못된 항목은 건너뜁니다.
 */
export function groupByTile<T extends { lat: number | string; lng: number | string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const lat = typeof item.lat === "number" ? item.lat : parseFloat(item.lat);
    const lng = typeof item.lng === "number" ? item.lng : parseFloat(item.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const key = tileKey(tileOf(lat, lng));
    const list = groups.get(key);
    if (list) list.push(item); else groups.set(key, [item]);
  }
  return groups;
}

/** 주소의 tx·ty 값을 칸으로 읽습니다. 숫자가 아니거나 우리나라 밖이면 null */
export function parseTileParams(tx: string | null, ty: string | null): TileXY | null {
  if (tx == null || ty == null || !/^\d{1,5}$/.test(tx) || !/^\d{1,5}$/.test(ty)) return null;
  const tile = { x: Number(tx), y: Number(ty) };
  return isValidTile(tile) ? tile : null;
}
