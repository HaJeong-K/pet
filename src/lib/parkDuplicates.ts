// src/lib/parkDuplicates.ts
//
// 전국 공원 데이터(parks)에 이미 있는 공원이 다른 공공데이터(문화정보원 '여행지' 등)에도 올라와
// 지도·목록에 같은 공원이 두 번 보이는 것을 막습니다 — 공원 데이터 쪽을 남기고 다른 쪽을 뺍니다.
//
// 같은 공원으로 보는 기준(둘 다 만족):
//   · 이름이 같다. 띄어쓰기·괄호는 무시하고, "근린공원"·"어린이공원" 같은 종류 말도 떼고 비교합니다
//     (예: "가수원근린공원" ↔ "가수원", "구평근린공원" ↔ "구평 근린공원").
//   · 서로 1.5km 안에 있다(넓은 공원은 출처마다 찍은 지점이 달라서 여유를 둡니다).
// 공원 데이터에 없는 공원(예: 대구 두류공원)은 겹치는 것이 없으므로 그대로 남습니다.

export type GeoNamed = { id: number | string; name: string; lat: number | string; lng: number | string };

/** 같은 공원으로 볼 수 있는 최대 거리 */
export const PARK_DUPLICATE_KM = 1.5;

const squeeze = (name: string) => (name || "").replace(/\(.*?\)|（.*?）/g, "").replace(/[\s·\-]/g, "");
/** 비교용 이름 — 공원 종류를 나타내는 꼬리말을 뗍니다. 남는 글자가 없으면(이름이 "근린공원"뿐) 빈 글자 */
export function parkNameKey(name: string): string {
  return squeeze(name).replace(/(근린|어린이|소|체육|문화|역사|수변|생태|도시자연|주제)*공원$/, "");
}
/** 공원일 수 있는 이름인지(공원이 아닌 가게까지 비교하지 않게) */
export const looksLikePark = (name: string) => /공원/.test(name || "");

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// 약 2km 격자 — 가까운 공원만 골라 비교합니다(장소 3만 × 공원 1만 7천을 전부 비교하지 않게).
const CELL = 50;
const cellOf = (lat: number, lng: number) => `${Math.floor(lat * CELL)}:${Math.floor(lng * CELL)}`;

/** places 중에서 공원 데이터와 겹치는 것의 id 모음 */
export function findParkDuplicateIds(places: GeoNamed[], parks: GeoNamed[]): Set<number | string> {
  const grid = new Map<string, { key: string; lat: number; lng: number }[]>();
  for (const park of parks) {
    const lat = Number(park.lat), lng = Number(park.lng), key = parkNameKey(park.name);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || key.length < 2) continue;
    const cell = cellOf(lat, lng);
    const list = grid.get(cell);
    if (list) list.push({ key, lat, lng }); else grid.set(cell, [{ key, lat, lng }]);
  }
  const duplicates = new Set<number | string>();
  for (const place of places) {
    if (!looksLikePark(place.name)) continue;
    const lat = Number(place.lat), lng = Number(place.lng), key = parkNameKey(place.name);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || key.length < 2) continue;
    const baseLat = Math.floor(lat * CELL), baseLng = Math.floor(lng * CELL);
    search:
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const park of grid.get(`${baseLat + i}:${baseLng + j}`) ?? []) {
          if (park.key === key && distanceKm(lat, lng, park.lat, park.lng) <= PARK_DUPLICATE_KM) { duplicates.add(place.id); break search; }
        }
      }
    }
  }
  return duplicates;
}
