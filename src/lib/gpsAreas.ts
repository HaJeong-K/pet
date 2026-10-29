// src/lib/gpsAreas.ts
//
// "GPS를 자주 켠 동네" — 이 기기에서 위치(GPS)가 잡힌 시·군·구를 날짜별로 기억해 둡니다.
// 일반 가게(카페·식당·용품점 등) 배너를 고를 때 1순위로 씁니다(src/lib/localAds.ts).
//   · 기기(브라우저 저장소)에만 두고 서버에는 저장하지 않습니다. 광고를 고를 때 시·군·구 이름만 잠깐 보냅니다.
//   · 서로 다른 날 2번 이상 위치가 잡힌 동네를 "자주 켠 동네"로 봅니다. 최근 30일, 6곳까지.

const KEY = "ggk_gps_areas_v1";
const KEEP = 6;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 서로 다른 날 이만큼 잡혀야 "자주" */
export const GPS_FREQUENT_DAYS = 2;
/** 광고를 고를 때 보내는 동네 수 */
export const GPS_AREAS_SENT = 3;

export type GpsArea = { sigungu: string; days: string[]; at: number };

const kstDay = (t: number) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);

/** 위치가 잡힌 동네를 더한 목록(저장소 없이 시험할 수 있는 계산 부분) */
export function addGpsArea(list: GpsArea[], sigungu: string, now = Date.now()): GpsArea[] {
  const name = sigungu.trim();
  if (!name) return list;
  const fresh = list.filter((a) => now - a.at < MAX_AGE_MS);
  const day = kstDay(now);
  const found = fresh.find((a) => a.sigungu === name);
  const updated: GpsArea = found
    ? { sigungu: name, days: found.days.includes(day) ? found.days : [...found.days, day].slice(-30), at: now }
    : { sigungu: name, days: [day], at: now };
  return [updated, ...fresh.filter((a) => a.sigungu !== name)].slice(0, KEEP);
}

/** 자주 켠 동네(서로 다른 날 GPS_FREQUENT_DAYS번 이상) — 많이 잡힌 순 */
export function frequentGpsAreas(list: GpsArea[], now = Date.now()): string[] {
  const since = kstDay(now - MAX_AGE_MS);
  return list
    .map((a) => ({ sigungu: a.sigungu, count: a.days.filter((d) => d >= since).length }))
    .filter((a) => a.count >= GPS_FREQUENT_DAYS)
    .sort((a, b) => b.count - a.count)
    .slice(0, GPS_AREAS_SENT)
    .map((a) => a.sigungu);
}

export function readGpsAreas(): GpsArea[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? (list as GpsArea[]).filter((a) => typeof a?.sigungu === "string" && Array.isArray(a.days)) : [];
  } catch { return []; }
}

/** GPS로 위치가 잡혔을 때 그 시·군·구를 기억합니다(src/lib/useUserRegion.ts). */
export function rememberGpsArea(sigungu: string | null | undefined) {
  if (!sigungu) return;
  try { localStorage.setItem(KEY, JSON.stringify(addGpsArea(readGpsAreas(), sigungu))); } catch { /* 저장소를 못 쓰면 기억하지 않습니다 */ }
}
