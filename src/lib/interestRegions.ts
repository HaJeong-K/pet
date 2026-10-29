// src/lib/interestRegions.ts
//
// "관심 지역" — 이 기기에서 최근에 검색하거나 둘러본 곳의 위치를 기억해 둡니다(여행·나들이를 알아보는 지역).
// 내 동네에 배너 광고 가게가 한 곳도 없을 때, 그 관심 지역 근처의 가게를 대신 보여 주는 데만 씁니다(src/lib/localAds.ts).
//   · 기기(브라우저 저장소)에만 두고 서버에는 저장하지 않습니다. 광고를 고를 때 좌표만 잠깐 보냅니다.
//   · 약 1km 단위로 뭉툭하게, 최근 8곳까지, 30일이 지나면 지웁니다.
//   · 같은 지역(5km 안)을 다시 찾으면 횟수(hits)를 올립니다 — "자주 검색한 지역"을 고르는 데 씁니다.

const KEY = "ggk_interest_regions_v1";
const KEEP = 8;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 이보다 가까운 곳은 같은 지역으로 보고 하나로 합칩니다 */
const SAME_AREA_KM = 5;

export type InterestPoint = { lat: number; lng: number; at: number; source: "search" | "place"; hits?: number };

const round = (n: number) => Math.round(n * 100) / 100;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 새 지점을 넣은 목록을 돌려줍니다(저장소 없이도 시험할 수 있는 계산 부분). */
export function addInterest(list: InterestPoint[], point: { lat: number; lng: number; source: InterestPoint["source"] }, now = Date.now()): InterestPoint[] {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return list;
  const live = list.filter((p) => now - p.at < MAX_AGE_MS);
  const same = live.filter((p) => km(p, point) <= SAME_AREA_KM);
  const hits = same.reduce((sum, p) => sum + (p.hits ?? 1), 0) + 1;
  const fresh = live.filter((p) => km(p, point) > SAME_AREA_KM);
  return [{ lat: round(point.lat), lng: round(point.lng), at: now, source: point.source, hits }, ...fresh].slice(0, KEEP);
}

export function readInterests(now = Date.now()): InterestPoint[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? (list as InterestPoint[]).filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number" && now - p.at < MAX_AGE_MS) : [];
  } catch { return []; }
}

/** 검색으로 지도를 옮겼거나 장소 상세를 열었을 때 그 위치를 기억합니다. */
export function rememberInterest(lat: number | string | null | undefined, lng: number | string | null | undefined, source: InterestPoint["source"]) {
  const point = { lat: Number(lat), lng: Number(lng), source };
  if (lat == null || lng == null || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
  try { localStorage.setItem(KEY, JSON.stringify(addInterest(readInterests(), point))); } catch { /* 저장소를 못 쓰면 기억하지 않습니다 */ }
}
