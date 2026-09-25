// src/lib/publicDataAggregate.ts
//
// 관광공사·식약처·문화정보원 공공데이터 3종을 병합·중복제거하는 서버 전용 로직.
// 원래 /api/public-data/nearby/route.ts 안에 있었는데, /api/public-data/place/[id]
// (장소 상세페이지의 단건 조회)도 같은 병합 결과가 필요해서 공용 모듈로 뺐습니다.
// 두 라우트가 이 파일을 통해 같은 모듈 메모리 캐시(getMergedPublicDataPlaces의
// cachedRaw)를 공유하므로, 한쪽이 이미 데이터를 받아온 뒤라면 다른 쪽은 그 캐시를
// 그대로 재사용합니다.
//
// ⚠ 서버 전용(Node 런타임) 코드입니다 — 브라우저에서 import하면 안 됩니다.

import { supabase } from "@/lib/supabase";
import { fetchCulturePlaces } from "@/lib/culturePlaces";
import { fetchFoodsafetyPlaces } from "@/lib/foodsafetyPlaces";
import { getTourPlaces } from "@/app/api/public-data/tour/route";

const SOURCE_ID_BASE: Record<string, number> = {
  tour: 1_000_000_000,
  foodsafety: 2_000_000_000,
  culture: 3_000_000_000,
};
const UNKNOWN_SOURCE_ID_BASE = 4_000_000_000;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toNumericId(sourceId: string): number {
  const match = sourceId.match(/^([a-z]+)-(.+)$/);
  if (!match) return UNKNOWN_SOURCE_ID_BASE + hashString(sourceId);
  const [, source, rest] = match;
  const base = SOURCE_ID_BASE[source] ?? UNKNOWN_SOURCE_ID_BASE;
  return base + hashString(rest);
}

const normalizeAddress = (addr: string | null | undefined) =>
  (addr || "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^가-힣0-9a-zA-Z]/g, "")
    .toLowerCase();

const dedupeKey = (item: any) => `${normalizeAddress(item.name)}|${normalizeAddress(item.address)}`;

function dedupeAcrossSources(...sources: any[][]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const list of sources) {
    for (const item of list) {
      const key = dedupeKey(item);
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// 서버 프로세스 메모리에 두는 전국 원본(필터링 전) 캐시 — 여러 요청이 같은 인스턴스에
// 몰려도 Supabase/관광공사 API를 매번 다시 때리지 않도록 합니다.
let cachedRaw: any[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

export async function getMergedPublicDataPlaces(): Promise<any[]> {
  if (cachedRaw && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRaw;

  const [tourResult, foodResult, cultureResult, hiddenResult] = await Promise.allSettled([
    getTourPlaces(),
    fetchFoodsafetyPlaces(),
    fetchCulturePlaces(),
    supabase.from("hidden_public_places").select("place_id"),
  ]);

  const tourItems = tourResult.status === "fulfilled" ? tourResult.value : [];
  const foodItems = foodResult.status === "fulfilled" ? foodResult.value : [];
  const cultureItems = cultureResult.status === "fulfilled" ? cultureResult.value : [];

  const raw = dedupeAcrossSources(foodItems, cultureItems, tourItems);

  const mapped = raw
    .filter((item: any) => item?.name && item?.lat && item?.lng)
    .map((item: any) => ({
      id: toNumericId(item.source_id),
      sourceId: item.source_id as string,
      name: item.name,
      category: item.category ?? null,
      address: item.address ?? "",
      lat: String(item.lat),
      lng: String(item.lng),
      pet_zone: item.pet_zone ?? "both",
      hours: item.hours ?? null,
      large_dog: item.large_dog ?? null,
      phone: item.phone ?? null,
      memo: item.memo ?? null,
      website: item.website ?? null,
      closed_days: item.closed_days ?? null,
      parking: item.parking ?? null,
      entry_fee: item.entry_fee ?? null,
      image_url: item.image_url || "/images/default-place.png",
      created_at: item.created_at ?? null,
      source: "public-data" as const,
    }));

  const hiddenIds = new Set(
    hiddenResult.status === "fulfilled" ? (hiddenResult.value.data || []).map((r: any) => Number(r.place_id)) : []
  );
  const visible = hiddenIds.size > 0 ? mapped.filter((p) => !hiddenIds.has(p.id)) : mapped;

  cachedRaw = visible;
  cachedAt = Date.now();
  return visible;
}
