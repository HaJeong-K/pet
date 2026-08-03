// src/lib/publicDataPlaces.ts
//
// 신청서에 명시된 전국 단위 공공데이터 3종을 지도에 통합하는 집계 레이어입니다.
//   1. 식품안전나라 반려동물 동반출입 음식점   → foodsafetyPlaces.ts (Supabase, 엑셀 반입)
//   2. 한국관광공사 반려동물 동반여행 서비스   → /api/public-data/tour (실시간 API)
//   3. 한국문화정보원 전국 반려동물 동반 가능 문화시설 위치 데이터 → culturePlaces.ts (Supabase, CSV 반입)
//
// 1번과 3번은 정부가 실시간 API가 아니라 파일(엑셀/CSV) 다운로드로만 제공해서, 한 번
// Supabase에 반입(ETL)해두고 그 테이블을 읽는 구조입니다. 각 소스가 데이터 미반입/네트워크
// 오류로 실패해도 나머지 소스와 기존 지도 데이터에는 영향을 주지 않도록 개별적으로
// 방어(fallback: [])하고, Promise.allSettled로 병렬 수집합니다.

import { fetchCulturePlaces } from "@/lib/culturePlaces";
import { fetchFoodsafetyPlaces } from "@/lib/foodsafetyPlaces";

const PUBLIC_DATA_ID_OFFSET = 800000; // AWS(900000+)·Supabase(소수 정수)와 겹치지 않는 대역

// 소스별 서브슬롯 — 지역코드 없이 소스명만으로 구분(각 소스 내에서는 source_id로 안전하게 해시)
const SOURCE_SLOT: Record<string, number> = {
  tour: 0,
  foodsafety: 1,
  culture: 2,
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toNumericId(sourceId: string): number {
  // "tour-12345", "foodsafety-987", "culture-42" 형식
  const match = sourceId.match(/^([a-z]+)-(.+)$/);
  if (!match) return PUBLIC_DATA_ID_OFFSET + (hashString(sourceId) % 90000);
  const [, source, rest] = match;
  const slot = SOURCE_SLOT[source] ?? 9;
  return PUBLIC_DATA_ID_OFFSET + slot * 90000 + (hashString(rest) % 90000);
}

let cachedPlaces: any[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5분 — 정부 API 호출량을 아끼기 위해 클라이언트에서도 캐시

// ── 소스 간 중복 제거 ──────────────────────────────────────────
// 예전에는 식당/카페류를 식약처 데이터로 "검증된 곳만" 통과시키는 게이트 방식이었는데,
// 식약처 데이터셋 자체가 부실해서(업소 수가 적어서) 실제로는 문제없는 곳까지
// 대거 걸러지는 부작용이 있었습니다. 이제는 게이트로 걸러내지 않고 관광공사·
// 식약처·문화정보원 세 소스를 전부 더한 뒤, 같은 장소가 여러 소스에 중복으로
// 실려 있으면(이름+주소 기준) 한 번만 남기는 방식으로 바꿨습니다. Supabase에
// 적재할 때도 culture_facilities/foodsafety_restaurants 사이에서 이미 한 번
// 중복 제거를 하지만(scripts/import-*.mjs 참고), 실시간으로 받아오는 관광공사
// 데이터까지 포함해 최종적으로 한 번 더 여기서 정리합니다.
//
// 우선순위: foodsafety(식약처 검증 데이터) > culture(문화정보원) > tour(관광공사)
// — 겹치는 장소가 있으면 더 신뢰도 높은 소스의 정보를 남깁니다.
const normalizeAddress = (addr: string | null | undefined) =>
  (addr || "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^가-힣0-9a-zA-Z]/g, "")
    .toLowerCase();

const dedupeKey = (item: any) =>
  `${normalizeAddress(item.name)}|${normalizeAddress(item.address)}`;

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

export async function fetchPublicDataPlaces(): Promise<any[]> {
  if (cachedPlaces && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPlaces;
  }

  const [tourResult, foodResult, cultureResult] = await Promise.allSettled([
    fetch("/api/public-data/tour").then((r) => (r.ok ? r.json() : [])),
    fetchFoodsafetyPlaces(),
    fetchCulturePlaces(),
  ]);

  const tourItems = tourResult.status === "fulfilled" ? tourResult.value : [];
  const foodItems = foodResult.status === "fulfilled" ? foodResult.value : [];
  const cultureItems = cultureResult.status === "fulfilled" ? cultureResult.value : [];

  // 공통(중복)된 장소는 한 번만, 나머지는 모두 포함
  const raw = dedupeAcrossSources(foodItems, cultureItems, tourItems);

  const mapped = raw
    .filter((item: any) => item?.name && item?.lat && item?.lng)
    .map((item: any) => ({
      id: toNumericId(item.source_id),
      name: item.name,
      category: item.category ?? null,
      address: item.address ?? "",
      lat: String(item.lat),
      lng: String(item.lng),
      pet_zone: item.pet_zone ?? "both", // 공공데이터 원본에 실내외 구분이 없어 기본값으로 표기
      hours: item.hours ?? null,
      large_dog: item.large_dog ?? null,
      pet_menu: item.pet_menu ?? null,
      phone: item.phone ?? null,
      memo: item.memo ?? null,
      website: item.website ?? null,
      closed_days: item.closed_days ?? null,
      parking: item.parking ?? null,
      entry_fee: item.entry_fee ?? null,
      image_url: item.image_url || "/images/default-place.png",
      created_at: item.created_at ?? new Date().toISOString(),
      source: "public-data" as const,
    }));

  cachedPlaces = mapped;
  cachedAt = Date.now();
  return mapped;
}
