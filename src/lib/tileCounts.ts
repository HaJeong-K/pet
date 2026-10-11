// src/lib/tileCounts.ts
//
// 지도를 넓게 볼 때 쓰는 "구역별 장소 수"(브라우저·서버 공용 계산).
//
// 예전에는 넓게 축소하면 화면 안의 장소 1만 6천여 곳을 하나하나 마커로 만든 뒤 묶음(클러스터)으로 합쳤습니다 —
// 그 "하나하나 만들기"가 PC에서도 수십 초, 폰에서는 1분 넘게 화면을 멈췄습니다.
// 다른 지도 서비스들처럼, 넓게 볼 때는 서버가 확대 단계에 맞는 크기의 구역으로 미리 세어 둔 "이 구역에 몇 곳"만 받아
// 동그라미 숫자로 보여 줍니다. 장소를 받지도, 마커를 만들지도 않으므로 장소가 몇만 곳이어도 화면에 그리는 것은
// 동그라미 수십 개뿐입니다.
//
// 구역 크기는 확대 단계마다 다릅니다(한 단계 넓어질 때마다 2배) — 화면에서 동그라미 사이 간격이 늘 비슷하도록.
// 서버에는 구역을 16×16개씩 묶은 "묶음" 단위로 요청합니다(주소가 고정이라 CDN이 응답을 대신 돌려줍니다).

import type { Bounds } from "@/lib/placeTiles";

/**
 * 구역 하나의 집계(전송량을 줄이려고 배열로 보냅니다).
 * [구역x, 구역y, 전체, 실내, 야외, 실내외, 동물병원, 동물약국, 장소들의 평균 위도, 평균 경도, 공원 수, 공원 평균 위도, 공원 평균 경도]
 * 실내·야외·실내외는 동물병원·동물약국을 뺀 수입니다(지도 위쪽 버튼의 거르기 규칙과 같게 — KakaoMap.tsx baseFilteredPlaces).
 */
export type CountRow = [number, number, number, number, number, number, number, number, number, number, number, number, number];

/** 지도 위쪽 버튼의 값(전체·실내 가능·야외 가능·실내외 모두·동물병원·동물약국) */
export type CountFilter = "all" | "indoor" | "terrace" | "both" | "vet" | "pharmacy";

/** 숫자 동그라미를 쓰기 시작하는 확대 단계(카카오맵 level — 클수록 넓게 봄)와, 구역 크기가 더 커지지 않는 단계 */
export const COUNT_MIN_LEVEL = 6;
export const COUNT_MAX_LEVEL = 14;
/** 묶음 하나에 들어가는 구역 수(가로·세로 각각) */
export const BLOCK_CELLS = 16;
/** 한 화면에서 요청하는 묶음 수 상한(이보다 많이 걸치는 일은 사실상 없지만, 잘못된 값으로 요청이 쏟아지지 않게) */
export const MAX_BLOCKS_PER_VIEW = 16;

// COUNT_MIN_LEVEL에서의 구역 크기(약 1.1km × 1.4km) — 화면에서 동그라미 간격이 약 160px입니다.
// (절반 크기로 해 보니 PC 화면에 동그라미가 250개 넘게 떠서 숫자를 읽기 어려웠습니다.)
const BASE_CELL_DEG = 0.0125;

/** 그 확대 단계에서 쓰는 단계 값(범위를 벗어나면 가장 가까운 값) */
export function countLevel(level: number): number {
  return Math.max(COUNT_MIN_LEVEL, Math.min(COUNT_MAX_LEVEL, Math.round(level)));
}

/** 그 확대 단계의 구역 크기(도). 한 단계 넓어질 때마다 2배 */
export function cellDegForLevel(level: number): number {
  return BASE_CELL_DEG * 2 ** (countLevel(level) - COUNT_MIN_LEVEL);
}

// 나눗셈 오차로 경계 값이 한 칸 아래로 떨어지지 않게 아주 작은 값을 더한 뒤 내림합니다(서버·브라우저가 같은 식).
const cellIndex = (deg: number, cellDeg: number) => Math.floor(deg / cellDeg + 1e-9);
const round4 = (v: number) => Math.round(v * 10000) / 10000;

export const blockKey = (bx: number, by: number) => `${bx}_${by}`;

/** 서버: 전체 장소·공원을 그 확대 단계의 구역으로 세고, 묶음별로 나눠 담습니다. */
export function buildCountBlocks(
  places: { lat: number | string; lng: number | string; category?: string | null; pet_zone?: string | null }[],
  parks: { lat: number | string; lng: number | string }[],
  level: number,
): Map<string, CountRow[]> {
  const cellDeg = cellDegForLevel(level);
  type Acc = { x: number; y: number; all: number; indoor: number; terrace: number; both: number; vet: number; pharmacy: number; lat: number; lng: number; parks: number; pLat: number; pLng: number };
  const cells = new Map<string, Acc>();
  const cellAt = (lat: number, lng: number) => {
    const x = cellIndex(lng, cellDeg), y = cellIndex(lat, cellDeg);
    const key = `${x}_${y}`;
    let acc = cells.get(key);
    if (!acc) { acc = { x, y, all: 0, indoor: 0, terrace: 0, both: 0, vet: 0, pharmacy: 0, lat: 0, lng: 0, parks: 0, pLat: 0, pLng: 0 }; cells.set(key, acc); }
    return acc;
  };
  const num = (v: number | string) => (typeof v === "number" ? v : parseFloat(v));

  for (const p of places) {
    const lat = num(p.lat), lng = num(p.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const acc = cellAt(lat, lng);
    acc.all++; acc.lat += lat; acc.lng += lng;
    if (p.category === "동물병원") acc.vet++;
    else if (p.category === "동물약국") acc.pharmacy++;
    else if (p.pet_zone === "indoor") acc.indoor++;
    else if (p.pet_zone === "terrace") acc.terrace++;
    else if (p.pet_zone === "both") acc.both++;
  }
  for (const p of parks) {
    const lat = num(p.lat), lng = num(p.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const acc = cellAt(lat, lng);
    acc.parks++; acc.pLat += lat; acc.pLng += lng;
  }

  const blocks = new Map<string, CountRow[]>();
  for (const a of cells.values()) {
    const row: CountRow = [
      a.x, a.y, a.all, a.indoor, a.terrace, a.both, a.vet, a.pharmacy,
      a.all ? round4(a.lat / a.all) : 0, a.all ? round4(a.lng / a.all) : 0,
      a.parks, a.parks ? round4(a.pLat / a.parks) : 0, a.parks ? round4(a.pLng / a.parks) : 0,
    ];
    const key = blockKey(Math.floor(a.x / BLOCK_CELLS), Math.floor(a.y / BLOCK_CELLS));
    const list = blocks.get(key);
    if (list) list.push(row); else blocks.set(key, [row]);
  }
  return blocks;
}

/** 브라우저: 화면 범위에 걸치는 묶음 목록(가장자리 구역까지 포함되도록 구역 하나만큼 넓혀서 고릅니다) */
export function blocksForBounds(bounds: Bounds, level: number): { bx: number; by: number }[] {
  const cellDeg = cellDegForLevel(level);
  const span = cellDeg * BLOCK_CELLS;
  const x0 = Math.floor((bounds.swLng - cellDeg) / span + 1e-9), x1 = Math.floor((bounds.neLng + cellDeg) / span + 1e-9);
  const y0 = Math.floor((bounds.swLat - cellDeg) / span + 1e-9), y1 = Math.floor((bounds.neLat + cellDeg) / span + 1e-9);
  const blocks: { bx: number; by: number }[] = [];
  for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) {
    if (blocks.length >= MAX_BLOCKS_PER_VIEW) return blocks;
    blocks.push({ bx, by });
  }
  return blocks;
}

/** 그 구역에서, 지금 고른 버튼에 해당하는 장소 수 */
export function placeCountOf(row: CountRow, filter: CountFilter): number {
  switch (filter) {
    case "indoor": return row[3];
    case "terrace": return row[4];
    case "both": return row[5];
    case "vet": return row[6];
    case "pharmacy": return row[7];
    default: return row[2];
  }
}

export type CountBubble = {
  /** 장소 동그라미 위치(그 구역 장소들의 평균 위치)와 수 */
  lat: number; lng: number; count: number;
  /** 공원 동그라미 위치와 수(공원을 보지 않으면 0) */
  parkLat: number; parkLng: number; parkCount: number;
};

/**
 * 받은 구역들 중 화면에 걸치는 것을 동그라미 목록으로 바꿉니다.
 * extra: 서버 집계에 없는 장소(우리 DB에 직접 등록된 곳 등)의 좌표 — 해당 구역 수에 더합니다.
 */
export function bubblesFromRows(
  rows: CountRow[], bounds: Bounds, level: number, filter: CountFilter, includeParks: boolean,
  extra: { lat: number; lng: number }[] = [],
): CountBubble[] {
  const cellDeg = cellDegForLevel(level);
  const minLat = bounds.swLat - cellDeg, maxLat = bounds.neLat + cellDeg, minLng = bounds.swLng - cellDeg, maxLng = bounds.neLng + cellDeg;
  type Acc = { count: number; lat: number; lng: number; parkCount: number; pLat: number; pLng: number };
  const groups = new Map<string, Acc>();
  const groupAt = (x: number, y: number) => {
    const key = `${x}_${y}`;
    let acc = groups.get(key);
    if (!acc) { acc = { count: 0, lat: 0, lng: 0, parkCount: 0, pLat: 0, pLng: 0 }; groups.set(key, acc); }
    return acc;
  };

  for (const row of rows) {
    const cellLat = row[1] * cellDeg, cellLng = row[0] * cellDeg;
    if (cellLat > maxLat || cellLat + cellDeg < minLat || cellLng > maxLng || cellLng + cellDeg < minLng) continue;
    const n = placeCountOf(row, filter);
    const parks = includeParks ? row[10] : 0;
    if (n === 0 && parks === 0) continue;
    const acc = groupAt(row[0], row[1]);
    // 위치는 그 구역 전체 장소의 평균을 씁니다(버튼별 평균을 따로 두지 않아도 동그라미 위치로는 충분합니다).
    if (n > 0) { acc.count += n; acc.lat += row[8] * n; acc.lng += row[9] * n; }
    if (parks > 0) { acc.parkCount += parks; acc.pLat += row[11] * parks; acc.pLng += row[12] * parks; }
  }
  for (const p of extra) {
    if (Number.isNaN(p.lat) || Number.isNaN(p.lng) || p.lat > maxLat || p.lat < minLat || p.lng > maxLng || p.lng < minLng) continue;
    const acc = groupAt(cellIndex(p.lng, cellDeg), cellIndex(p.lat, cellDeg));
    acc.count += 1; acc.lat += p.lat; acc.lng += p.lng;
  }

  const bubbles: CountBubble[] = [];
  for (const a of groups.values()) {
    bubbles.push({
      count: a.count, lat: a.count ? a.lat / a.count : 0, lng: a.count ? a.lng / a.count : 0,
      parkCount: a.parkCount, parkLat: a.parkCount ? a.pLat / a.parkCount : 0, parkLng: a.parkCount ? a.pLng / a.parkCount : 0,
    });
  }
  return bubbles;
}

/** 동그라미에 쓸 숫자 표기: 9,999까지는 그대로, 그 위는 "1.2만" */
export function formatBubbleCount(n: number): string {
  if (n < 10000) return String(n);
  const man = n / 10000;
  return `${man >= 10 ? Math.round(man) : Math.round(man * 10) / 10}만`;
}

/** 주소의 level·bx·by 값을 읽습니다. 숫자가 아니거나 범위를 벗어나면 null */
export function parseCountParams(level: string | null, bx: string | null, by: string | null): { level: number; bx: number; by: number } | null {
  if (level == null || bx == null || by == null || !/^\d{1,2}$/.test(level) || !/^\d{1,5}$/.test(bx) || !/^\d{1,5}$/.test(by)) return null;
  const l = Number(level);
  if (l < COUNT_MIN_LEVEL || l > COUNT_MAX_LEVEL) return null;
  return { level: l, bx: Number(bx), by: Number(by) };
}

// ── 가까이 볼 때(이름표 단계)인데 화면 안에 장소가 너무 많은 경우 ──
// 이 단계에서는 장소를 이미 받아 두었으므로 서버에 묻지 않고, 받아 둔 장소를 화면에서 바로 구역별로 셉니다
// (검색·버튼으로 걸러진 결과 그대로 셀 수 있습니다).

/** 이름표 단계(COUNT_MIN_LEVEL보다 가까이)에서 쓰는 구역 크기 — 넓게 볼 때의 규칙을 그대로 이어서 한 단계마다 절반 */
export function cellDegForCloseLevel(level: number): number {
  return BASE_CELL_DEG * 2 ** (Math.max(1, Math.round(level)) - COUNT_MIN_LEVEL);
}

/** 좌표 목록에서 화면 범위 안의 것만 구역별로 묶어 동그라미로 만듭니다. */
export function bubblesFromPoints(
  places: { lat: number | string; lng: number | string }[],
  parks: { lat: number | string; lng: number | string }[],
  bounds: Bounds, cellDeg: number,
): CountBubble[] {
  type Acc = { count: number; lat: number; lng: number; parkCount: number; pLat: number; pLng: number };
  const groups = new Map<string, Acc>();
  const num = (v: number | string) => (typeof v === "number" ? v : parseFloat(v));
  const add = (item: { lat: number | string; lng: number | string }, park: boolean) => {
    const lat = num(item.lat), lng = num(item.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < bounds.swLat || lat > bounds.neLat || lng < bounds.swLng || lng > bounds.neLng) return;
    const key = `${cellIndex(lng, cellDeg)}_${cellIndex(lat, cellDeg)}`;
    let acc = groups.get(key);
    if (!acc) { acc = { count: 0, lat: 0, lng: 0, parkCount: 0, pLat: 0, pLng: 0 }; groups.set(key, acc); }
    if (park) { acc.parkCount++; acc.pLat += lat; acc.pLng += lng; } else { acc.count++; acc.lat += lat; acc.lng += lng; }
  };
  for (const p of places) add(p, false);
  for (const p of parks) add(p, true);
  const bubbles: CountBubble[] = [];
  for (const a of groups.values()) {
    bubbles.push({
      count: a.count, lat: a.count ? a.lat / a.count : 0, lng: a.count ? a.lng / a.count : 0,
      parkCount: a.parkCount, parkLat: a.parkCount ? a.pLat / a.parkCount : 0, parkLng: a.parkCount ? a.pLng / a.parkCount : 0,
    });
  }
  return bubbles;
}
