// src/lib/nearestGrid.ts
//
// "가장 가까운 점까지의 거리"를 빠르게 구하는 격자 색인.
//
// 지도 추천 점수는 장소마다 "가장 가까운 공원까지의 거리"가 필요합니다. 예전에는 장소 하나마다 주변 공원을
// 전부 훑어서(장소 약 1,700곳 × 공원 수천 곳 = 수백만 번의 거리 계산) 지도 로딩이 몇 초씩 멈췄습니다.
// 공원을 격자 칸에 미리 나눠 담아 두면, 장소가 속한 칸과 그 둘레 칸만 보면 되므로 계산이 수백 분의 일로 줄어듭니다.
// 결과는 전부 훑는 방식과 완전히 같습니다(둘레를 넓혀 가다가 "더 먼 칸에는 더 가까운 점이 있을 수 없을 때" 멈춤).

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이의 거리(km) — 지도 화면(KakaoMap)의 getDistance와 같은 식 */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 격자 한 칸의 크기(도). 0.004도 ≈ 위도 방향 440m.
 * ⚠ 예전에는 0.02도(2.2km)였는데, 서울처럼 공원이 빽빽한 곳은 한 칸에 공원이 수백 곳 들어가서, 장소 1만여 곳마다
 * 둘레 9칸의 공원 수천 곳과 거리를 재느라 지도 로딩이 0.5초(느린 폰은 2초 이상) 멈췄습니다. 칸을 잘게 나눠
 * 한 번에 보는 공원 수를 수십 곳으로 줄였습니다(결과는 같습니다).
 */
const CELL_DEG = 0.004;
/** 칸 번호 두 개(x, y)를 숫자 하나로 합칩니다 — 글자로 이어 붙이는 것보다 훨씬 빠릅니다. */
const cellKey = (x: number, y: number) => x * 100000 + y;
/** 한 칸의 "가장 짧은 변" 길이(km) — 우리나라 위도(최대 약 39도)에서 경도 방향이 더 짧습니다. 멈춤 판단을 보수적으로 하려고 작게 잡습니다. */
const CELL_MIN_KM = CELL_DEG * 111 * Math.cos(toRad(39.5));

export type NearestGrid = {
  /**
   * 가장 가까운 점까지의 거리(km). 점이 하나도 없으면 null.
   * maxKm을 주면 그 거리 안에서만 찾고, 그 안에 점이 없으면 null을 돌려줍니다(더 먼 거리는 쓸 일이 없을 때 — 훨씬 빠름).
   */
  nearestKm: (lat: number, lng: number, maxKm?: number) => number | null;
  size: number;
};

/** 좌표 목록(문자열 좌표도 허용)으로 격자 색인을 만듭니다. 좌표가 잘못된 항목은 건너뜁니다. */
export function buildNearestGrid(points: { lat: number | string; lng: number | string }[]): NearestGrid {
  const cells = new Map<number, number[]>(); // 칸 번호 → [lat, lng, lat, lng, …]
  let size = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const lat = typeof p.lat === "number" ? p.lat : parseFloat(p.lat);
    const lng = typeof p.lng === "number" ? p.lng : parseFloat(p.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const x = Math.floor(lng / CELL_DEG), y = Math.floor(lat / CELL_DEG);
    const key = cellKey(x, y);
    const list = cells.get(key);
    if (list) list.push(lat, lng); else cells.set(key, [lat, lng]);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    size++;
  }

  const nearestKm = (lat: number, lng: number, maxKm?: number): number | null => {
    if (size === 0 || Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const cx = Math.floor(lng / CELL_DEG), cy = Math.floor(lat / CELL_DEG);
    // 점들이 있는 범위를 다 덮을 때까지만 둘레를 넓힙니다.
    const maxRing = Math.max(Math.abs(cx - minX), Math.abs(cx - maxX), Math.abs(cy - minY), Math.abs(cy - maxY));
    let best = Infinity;
    const scan = (x: number, y: number) => {
      const list = cells.get(cellKey(x, y));
      if (!list) return;
      for (let i = 0; i < list.length; i += 2) {
        const d = distanceKm(lat, lng, list[i], list[i + 1]);
        if (d < best) best = d;
      }
    };
    for (let ring = 0; ring <= maxRing; ring++) {
      // 둘레 ring의 칸들은 적어도 (ring - 1)칸만큼 떨어져 있습니다 — 이미 그보다 가까운 점을 찾았으면 끝.
      const ringMinKm = (ring - 1) * CELL_MIN_KM;
      if (best <= ringMinKm) break;
      // 찾는 거리 한도가 있으면, 그보다 먼 둘레는 볼 필요가 없습니다.
      if (maxKm != null && ringMinKm > maxKm) break;
      if (ring === 0) { scan(cx, cy); continue; }
      // 이번 둘레의 테두리 칸만: 위·아래 줄 전체 + 왼쪽·오른쪽 줄(모서리 제외)
      for (let dx = -ring; dx <= ring; dx++) { scan(cx + dx, cy - ring); scan(cx + dx, cy + ring); }
      for (let dy = -ring + 1; dy <= ring - 1; dy++) { scan(cx - ring, cy + dy); scan(cx + ring, cy + dy); }
    }
    if (!Number.isFinite(best)) return null;
    return maxKm != null && best > maxKm ? null : best;
  };

  return { nearestKm, size };
}
