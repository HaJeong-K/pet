// src/lib/localAds.ts
//
// 배너 광고(커뮤니티·마이페이지의 PC 양옆 광고 칸 2자리 + 휴대폰 한 줄 배너 1자리)에 어느 가게를 누구에게 보여 줄지 정하는 규칙.
// 글자·숫자만 다루는 함수라 화면·서버·테스트가 같이 씁니다.
//
// ① 누가 배너에 나올 수 있나 — 프리미엄을 이용 중인 가게 가운데
//      · '동네 대표' 요금제이거나
//      · 관리자가 "배너 광고 추가 제공" 혜택을 켜 준 가게(기한이 있으면 그날까지)
// ② 누구에게 보이나 — 가게와 같은 시·군·구에 있는 사용자에게만(가게 주소에 그 시·군·구 이름이 들어 있는지로 판단).
//      사용자의 위치를 모르면 보여 주지 않습니다.
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


// ── 누구에게 어느 가게를 보여 줄지(단계별) ──
// 1) local            : 보는 사람과 같은 시·군·구의 배너 가게가 있으면 그 가게들만
// 2) adjacent         : 없으면 바로 근처(ADJACENT_KM 안)의 배너 가게
// 3) interest         : 그것도 없으면 이 사람이 최근에 찾아보거나 둘러본 다른 지역(기기에 기억해 둔 관심 지역) 근처의 배너 가게
// 4) interest-premium : 관심 지역 근처에 배너 가게가 없으면 그 근처의 프리미엄 가게
// 5) random           : 아무 관련이 없으면 전국의 배너 가게 중에서 무작위
// 고른 후보(pool) 안에서 실제로 누구를 내보낼지는 서버가 "지금까지 가장 적게 나간 가게"로 정합니다(src/lib/server/bannerAds.ts).

/** "인접한 지역"으로 보는 거리 */
export const ADJACENT_KM = 20;
/** 한 번에 받아들이는 관심 지역 수 */
export const INTEREST_POINTS_MAX = 5;

export type GeoAdPlace = AdPlace & { lat: number | string | null; lng: number | string | null };
export type GeoPoint = { lat: number; lng: number };
export type BannerViewer = { sigungu?: string | null; lat?: number | null; lng?: number | null; interests?: GeoPoint[] };
export type BannerTier = "local" | "adjacent" | "interest" | "interest-premium" | "random" | "none";

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
  const local = advertisers.filter((p) => isInSigungu(p.address, viewer.sigungu));
  if (local.length > 0) return { tier: "local", pool: local };

  const here = viewer.lat != null && viewer.lng != null ? [{ lat: viewer.lat, lng: viewer.lng }] : [];
  const adjacent = here.length ? advertisers.filter((p) => nearAny(p, here)) : [];
  if (adjacent.length > 0) return { tier: "adjacent", pool: adjacent };

  const interests = (viewer.interests ?? []).slice(0, INTEREST_POINTS_MAX);
  if (interests.length > 0) {
    const byInterest = advertisers.filter((p) => nearAny(p, interests));
    if (byInterest.length > 0) return { tier: "interest", pool: byInterest };
    const premiumNear = places.filter((p) => p.is_premium && !!p.premium_expires_at && new Date(p.premium_expires_at).getTime() > now && nearAny(p, interests));
    if (premiumNear.length > 0) return { tier: "interest-premium", pool: premiumNear };
  }
  return advertisers.length > 0 ? { tier: "random", pool: advertisers } : { tier: "none", pool: [] };
}
