// src/lib/server/bannerAds.ts
//
// 배너 광고에 쓸 자료를 DB에서 읽고, 실제로 내보낼 가게를 고릅니다(서버 전용). 고르는 규칙은 src/lib/localAds.ts.
// 요금제 단계 칸(places.premium_plan)이나 혜택·배너 표가 아직 없어도 오류 없이 "없는 것"으로 봅니다.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import {
  BANNER_SLOTS_ON_SCREEN, chooseBannerPool, isLodgingAd,
  type BannerPerk, type BannerTier, type BannerViewer, type GeoAdPlace,
} from "@/lib/localAds";
import { bannerAddress, type BannerFontId } from "@/lib/bannerCreative";

const BASE_COLUMNS = "id, name, category, image_url, address, lat, lng, is_premium, premium_expires_at";

/** 프리미엄을 이용 중인 가게 전부와 가게별 배너 혜택 */
export async function loadBannerCandidates(): Promise<{ places: GeoAdPlace[]; perks: Map<number, BannerPerk> }> {
  const now = new Date().toISOString();
  let { data, error } = await db.from("places").select(`${BASE_COLUMNS}, premium_plan`).eq("is_premium", true).gt("premium_expires_at", now).limit(1000);
  if (error && isMissingSchema(error)) {
    ({ data, error } = await db.from("places").select(BASE_COLUMNS).eq("is_premium", true).gt("premium_expires_at", now).limit(1000) as never);
  }
  if (error) throw new Error(error.message);
  const places = (data ?? []) as GeoAdPlace[];
  const perks = new Map<number, BannerPerk>();
  if (places.length > 0) {
    const { data: rows } = await db.from("premium_perks").select("place_id, banner_ad, banner_until").in("place_id", places.map((p) => p.id));
    for (const row of rows ?? []) perks.set(Number(row.place_id), row as BannerPerk);
  }
  return { places, perks };
}

/** 화면에 그릴 배너 한 장 — 사장님이 만든 내용이 있으면 그것, 없으면 가게 이름과 사진으로 */
export type BannerCard = {
  id: number; name: string; category: string | null;
  /** 가게 이름 옆에 적는 짧은 주소 */
  address: string | null;
  image: string | null; headline: string; body: string | null; font: BannerFontId;
  /** 사장님이 직접 만든 배너인지(아니면 기본 모양) */
  custom: boolean;
};

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

/**
 * 이 사람에게 내보낼 배너를 slots장 고릅니다.
 *   ① 후보 정하기: 숙소는 자주 검색한 지역 → 무작위, 일반 가게는 GPS를 자주 켠 동네 → 자주 검색한 지역 → 무작위(chooseBannerPool)
 *   ② 후보 안에서 고르기: 지금까지 가장 적게 나간 가게부터(같으면 무작위) — DB 함수 pick_banners가 고르면서 횟수를 올려,
 *      같은 후보끼리는 노출 횟수가 1번 넘게 벌어지지 않습니다. 함수가 아직 없으면(banner-ads.sql 실행 전) 무작위로 고릅니다.
 */
export async function serveBanners(viewer: BannerViewer, slots: number): Promise<{ tier: BannerTier; cards: BannerCard[] }> {
  const { places, perks } = await loadBannerCandidates();
  const { tier, pool } = chooseBannerPool(places, perks, viewer);
  if (pool.length === 0) return { tier, cards: [] };
  const want = Math.max(1, Math.min(slots, pool.length, BANNER_SLOTS_ON_SCREEN));

  let pickedIds: number[];
  const { data: picked, error } = await db.rpc("pick_banners", { p_ids: pool.map((p) => Number(p.id)), p_n: want });
  if (error || !Array.isArray(picked) || picked.length === 0) pickedIds = shuffle(pool).slice(0, want).map((p) => Number(p.id));
  else pickedIds = shuffle((picked as unknown[]).map((v) => Number(typeof v === "object" && v !== null ? Object.values(v)[0] : v)));

  const { data: creatives } = await db.from("owner_banners").select("place_id, headline, body, image_url, font, hidden").in("place_id", pickedIds);
  const creativeOf = new Map((creatives ?? []).filter((c) => !c.hidden).map((c) => [Number(c.place_id), c]));

  const cards = pickedIds.map((id) => {
    const place = pool.find((p) => Number(p.id) === id);
    if (!place) return null;
    const creative = creativeOf.get(id);
    return {
      id, name: place.name, category: place.category, address: bannerAddress(place.address),
      image: creative?.image_url || place.image_url || null,
      headline: creative?.headline || place.name,
      // 사장님이 배너를 만들지 않았을 때의 기본 문구(지역을 한정하는 표현은 쓰지 않음)
      body: creative ? creative.body : isLodgingAd(place) ? "반려동물 동반 숙소" : "반려동물 동반 가게",
      font: ((creative?.font as BannerFontId) || "logo"),
      custom: !!creative,
    } satisfies BannerCard;
  }).filter((c): c is BannerCard => c !== null);
  return { tier, cards };
}
