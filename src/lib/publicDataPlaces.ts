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
import { supabase } from "@/lib/supabase";

// ⚠ 예전엔 소스별로 9만 개짜리 슬롯(PUBLIC_DATA_ID_OFFSET + slot*90000 + hash%90000)에
// id를 욱여넣었습니다. 문화원 데이터가 2천여 건일 땐 괜찮았지만, 21,000여 건으로
// 늘어나면서 생일 문제(birthday paradox)로 실제 계산해보니 약 10.8%(2,286건)가 서로
// 같은 id로 충돌해서 마커 Map/React key가 뒤 항목에 덮어써져 지도에서 조용히
// 사라지고 있었습니다. hash를 9만으로 나누지 않고 32비트 그대로(0~42억) 쓰고, 소스별
// 밑수를 10억 단위로 크게 벌려서 슬롯 부족 문제 자체를 없앴습니다(같은 소스 안에서
// 수만~수십만 건이 있어도 충돌 확률이 사실상 0에 가깝습니다).
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
  return hash; // 0 ~ 4,294,967,295 (32bit unsigned) — 더 이상 축소하지 않음
}

function toNumericId(sourceId: string): number {
  // "tour-12345", "foodsafety-987", "culture-42" 형식
  const match = sourceId.match(/^([a-z]+)-(.+)$/);
  if (!match) return UNKNOWN_SOURCE_ID_BASE + hashString(sourceId);
  const [, source, rest] = match;
  const base = SOURCE_ID_BASE[source] ?? UNKNOWN_SOURCE_ID_BASE;
  return base + hashString(rest);
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

  // ⚠ 공공데이터 출처 장소는 Supabase `places` 테이블에 실제 행이 없어서 관리자가
  // "삭제"할 수 없었습니다. 폐업 등으로 실제로는 없어진 곳을 최신화할 수 있도록,
  // 실제 행을 지우는 대신 이 차단 목록(hidden_public_places)에 id를 올려두고
  // 매번 불러올 때마다 걸러냅니다. 목록 조회가 실패해도(테이블이 아직 없거나 등)
  // 전체 지도 로딩에는 영향 주지 않도록 방어합니다.
  const [tourResult, foodResult, cultureResult, hiddenResult] = await Promise.allSettled([
    fetch("/api/public-data/tour").then((r) => (r.ok ? r.json() : [])),
    fetchFoodsafetyPlaces(),
    fetchCulturePlaces(),
    supabase.from("hidden_public_places").select("place_id"),
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
      // ⚠ 관리자가 이 장소를 지울 때 "실시간 API 출처(관광공사, tour-*)"는 숨김 처리,
      // "CSV로 반입해둔 출처(식약처 foodsafety-*, 문화정보원 culture-*)"는 원본 테이블
      // 행까지 완전 삭제해야 해서, 어느 소스인지 구분할 수 있도록 원본 source_id를
      // 그대로 들고 다닙니다(place/[id]/page.tsx handleDeletePlace에서 사용).
      sourceId: item.source_id as string,
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
      // ⚠ 이전에는 원본 소스(관광공사/식약처/문화정보원)에 등록일이 없으면
      // new Date().toISOString()로 "지금"을 채워 넣었습니다. 그 결과 캐시가 갱신될
      // 때마다(5분 TTL 만료 시) 공공데이터 장소 전부가 recommend.ts의 "신규 등록
      // 가점"(14일 이내 +10점) 대상이 되어, 실제로는 수년 전부터 있던 장소가 계속
      // 신규 장소로 취급되는 버그가 있었습니다. 등록일을 알 수 없는 값이므로 null로
      // 두면 recommend.ts가 가점 없이 정상 처리합니다.
      created_at: item.created_at ?? null,
      source: "public-data" as const,
    }));

  const hiddenIds = new Set(
    hiddenResult.status === "fulfilled"
      ? (hiddenResult.value.data || []).map((r: any) => Number(r.place_id))
      : []
  );
  const visible = hiddenIds.size > 0 ? mapped.filter((p) => !hiddenIds.has(p.id)) : mapped;

  cachedPlaces = visible;
  cachedAt = Date.now();
  return visible;
}
