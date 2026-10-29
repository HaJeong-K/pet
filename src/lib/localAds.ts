// src/lib/localAds.ts
//
// 배너 광고(커뮤니티·마이페이지의 PC 양옆 광고 칸 2자리 + 휴대폰 한 줄 배너 1자리)에 어느 가게를 누구에게 보여 줄지 정하는 규칙.
// 글자·숫자만 다루는 함수라 화면·서버·테스트가 같이 씁니다.
//
// ① 누가 배너에 나올 수 있나 — 프리미엄을 이용 중인 가게 가운데
//      · '동네 대표' 요금제이거나
//      · 관리자가 "배너 광고 추가 제공" 혜택을 켜 준 가게(기한이 있으면 그날까지)
// ② 누구에게 보이나 — 아래 "누구에게 어느 가게를 보여 줄지(순위)"를 따릅니다
//      (숙소: 자주 검색한 지역 → 무작위, 일반 가게: GPS를 자주 켠 동네 → 자주 검색한 지역 → 무작위).
// ③ 한 동네에 몇 곳까지 — 제한이 없습니다. 가게가 많아지면 모든 가게가 같은 횟수만큼 나가도록 돌아가며 보여 줍니다.
// ④ 여러 곳이면 어떤 순서로 — 10분마다 한 칸씩 돌아가며 맨 앞을 바꿉니다(모든 가게가 같은 시간만큼 앞자리에 섭니다).

import { normalizePlan } from "@/lib/ownerPlans";

/** 한 화면에 들어가는 배너 자리 수(PC 양옆 2칸, 휴대폰은 1칸) */
export const BANNER_SLOTS_ON_SCREEN = 2;
/** 맨 앞 가게가 바뀌는 주기 */
export const BANNER_ROTATE_MS = 10 * 60_000;

export type BannerPerk = { banner_ad?: boolean | null; banner_until?: string | null } | null | undefined;
export type AdPlace = {
  id: number; name: string; category: string | null; image_url: string | null; address: string | null;
  is_premium: boolean | null; premium_expires_at: string | null; premium_plan?: string | null;
};
export type BannerSource = "plan" | "perk";

const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");

/** 이 가게가 지금 배너에 나올 수 있는지 — 요금제 덕분이면 "plan", 관리자 혜택 덕분이면 "perk", 아니면 null */
export function bannerSource(place: Pick<AdPlace, "is_premium" | "premium_expires_at" | "premium_plan">, perk: BannerPerk, now = Date.now()): BannerSource | null {
  if (!place.is_premium || !place.premium_expires_at || new Date(place.premium_expires_at).getTime() <= now) return null;
  if (normalizePlan(place.premium_plan) === "local") return "plan";
  if (perk?.banner_ad && (!perk.banner_until || new Date(perk.banner_until).getTime() > now)) return "perk";
  return null;
}

/** 가게 주소가 그 시·군·구 안인지("포항시 남구" ↔ "경북 포항시 남구 …") */
export function isInSigungu(address: string | null | undefined, sigungu: string | null | undefined): boolean {
  const target = squeeze(sigungu);
  return target.length >= 2 && squeeze(address).includes(target);
}

/**
 * 가게 주소에서 배너 구역(시·도 + 시·군·구)을 뽑습니다. 예: "경북 포항시 남구 대잠동 1" → "경북 포항시 남구", "서울 강남구 …" → "서울 강남구".
 * 관리자 화면에서 "이 동네에 배너가 몇 곳 나가고 있는지" 세는 데 씁니다.
 */
export function bannerRegionOf(address: string | null | undefined): string {
  const parts = (address ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "지역 모름";
  // "포항시 남구"처럼 시 아래에 구가 있는 곳은 구까지
  const withGu = /시$/.test(parts[1]) && /구$/.test(parts[2] ?? "");
  return parts.slice(0, withGu ? 3 : 2).join(" ");
}

/** 10분마다 한 칸씩 돌린 순서(번호순으로 세운 뒤 돌립니다 — 언제 물어도 같은 시각에는 같은 순서) */
export function rotateByTime<T extends { id: number }>(list: T[], now = Date.now()): T[] {
  if (list.length < 2) return list;
  const sorted = [...list].sort((a, b) => a.id - b.id);
  const shift = Math.floor(now / BANNER_ROTATE_MS) % sorted.length;
  return [...sorted.slice(shift), ...sorted.slice(0, shift)];
}

/** 그 시·군·구 사용자에게 보여 줄 배너 가게 목록(순서대로 앞자리부터 씁니다). 주소는 화면에 필요 없어 빼고 돌려줍니다. */
export function pickLocalAds(
  places: AdPlace[],
  perks: Map<number, BannerPerk>,
  sigungu: string | null | undefined,
  now = Date.now(),
): { id: number; name: string; category: string | null; image_url: string | null }[] {
  const eligible = places.filter((p) => bannerSource(p, perks.get(Number(p.id)), now) !== null && isInSigungu(p.address, sigungu));
  return rotateByTime(eligible, now).map(({ id, name, category, image_url }) => ({ id, name, category, image_url }));
}


// ── 누구에게 어느 가게를 보여 줄지(순위) ──
// 숙소(펜션·호텔·캠핑 등)와 일반 가게(카페·식당·용품점 등)는 찾는 방식이 달라 순위를 따로 둡니다.
//   숙소      1순위: 그 지역을 자주 검색한 사람(여행 갈 곳을 알아보는 사람) → 2순위: 아무에게나 무작위
//   일반 가게  1순위: 그 동네에서 GPS를 자주 켠 사람(지금 있는 동네 포함) → 2순위: 그 지역을 자주 검색한 사람 → 3순위: 무작위
// 한 사람에게는 가장 높은 순위의 후보부터 보여 줍니다:
//   ① local  : 내 GPS 동네의 일반 가게 + 내가 자주 검색한 지역의 숙소(둘 다 1순위)
//   ② search : 내가 자주 검색한 지역의 일반 가게(일반 가게 2순위)
//   ③ random : 전국의 배너 가게(숙소·일반 가게) 중 무작위
// 고른 후보(pool) 안에서 실제로 누구를 내보낼지는 서버가 "지금까지 가장 적게 나간 가게"로 정합니다(src/lib/server/bannerAds.ts).

/** "그 지역 근처"로 보는 거리(검색한 지점에서) */
export const ADJACENT_KM = 20;
/** 한 번에 받아들이는 검색 지역 수 */
export const INTEREST_POINTS_MAX = 5;
/** 같은 지역을 이만큼 찾아봐야 "자주 검색한 지역" */
export const SEARCH_MIN_HITS = 2;
/** 한 번에 받아들이는 GPS 동네 수 */
export const GPS_AREAS_MAX = 3;

export type GeoAdPlace = AdPlace & { lat: number | string | null; lng: number | string | null };
export type GeoPoint = { lat: number; lng: number };
export type SearchPoint = GeoPoint & { hits?: number };
/**
 * sigungu: 지금 GPS로 잡힌 시·군·구, gpsAreas: 이 기기에서 GPS를 자주 켠 시·군·구(src/lib/gpsAreas.ts),
 * interests: 최근에 찾아본 지역과 찾아본 횟수(src/lib/interestRegions.ts)
 */
export type BannerViewer = { sigungu?: string | null; lat?: number | null; lng?: number | null; gpsAreas?: string[]; interests?: SearchPoint[] };
export type BannerTier = "local" | "search" | "random" | "none";

/** 숙소 업종인지(펜션·호텔·리조트·캠핑·글램핑·한옥·게스트하우스·민박 등) */
export const isLodgingAd = (p: Pick<AdPlace, "category" | "name">) => /펜션|풀빌라|독채|호텔|모텔|리조트|콘도|캠핑|글램핑|카라반|한옥|스테이|게스트|민박|숙박|숙소/.test(`${p.category ?? ""}`);

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const pointOf = (p: GeoAdPlace): GeoPoint | null => {
  const lat = Number(p.lat), lng = Number(p.lng);
  return p.lat != null && p.lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};
const nearAny = (p: GeoAdPlace, points: GeoPoint[]) => { const at = pointOf(p); return !!at && points.some((q) => distanceKm(at, q) <= ADJACENT_KM); };

/** places는 "지금 프리미엄을 이용 중인 가게" 전부여야 합니다. */
export function chooseBannerPool(places: GeoAdPlace[], perks: Map<number, BannerPerk>, viewer: BannerViewer, now = Date.now()): { tier: BannerTier; pool: GeoAdPlace[] } {
  const advertisers = places.filter((p) => bannerSource(p, perks.get(Number(p.id)), now) !== null);
  const lodgings = advertisers.filter(isLodgingAd);
  const stores = advertisers.filter((p) => !isLodgingAd(p));

  // GPS 동네: 지금 있는 시·군·구 + 자주 켠 시·군·구
  const gpsAreas = [...new Set([viewer.sigungu, ...(viewer.gpsAreas ?? []).slice(0, GPS_AREAS_MAX)].filter((a): a is string => !!a))];
  // 자주 검색한 지역: 같은 지역을 SEARCH_MIN_HITS번 이상 찾아본 곳(많이 찾은 순)
  const searched = (viewer.interests ?? []).filter((p) => (p.hits ?? 1) >= SEARCH_MIN_HITS)
    .sort((a, b) => (b.hits ?? 1) - (a.hits ?? 1)).slice(0, INTEREST_POINTS_MAX);

  const storesInGps = stores.filter((p) => gpsAreas.some((a) => isInSigungu(p.address, a)));
  const lodgingsSearched = searched.length ? lodgings.filter((p) => nearAny(p, searched)) : [];
  const first = [...storesInGps, ...lodgingsSearched];
  if (first.length > 0) return { tier: "local", pool: first };

  const storesSearched = searched.length ? stores.filter((p) => nearAny(p, searched)) : [];
  if (storesSearched.length > 0) return { tier: "search", pool: storesSearched };

  return advertisers.length > 0 ? { tier: "random", pool: advertisers } : { tier: "none", pool: [] };
}
