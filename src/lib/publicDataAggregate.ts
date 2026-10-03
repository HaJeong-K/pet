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

import { gzipSync, gunzipSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

// ── 캐시 구조 ──
// ⚠ 예전엔 병합 목록을 서버 메모리에만 두었습니다. Vercel 같은 서버리스 환경은 접속이 몰리면
// 서버 인스턴스가 여러 개 새로 뜨고, 한동안 안 쓰면 꺼집니다 — 새로 뜰 때마다 관광공사(목록
// 10여 페이지)·식약처·문화정보원 API를 처음부터 다시 불러서 3초 넘게 걸리고, 공공데이터포털
// 하루 호출 한도도 금방 소진될 수 있었습니다.
// 이제는 3단계로 둡니다.
//   1) 스냅샷: 하루 한 번(크론, /api/cron/sync-public-data) 공공 API에서 전체 목록을 만들어
//      Supabase Storage에 압축 파일 하나로 저장합니다(전국 약 3만 곳 ≈ 17MB, 압축 ≈ 2MB —
//      Vercel 데이터 캐시의 항목당 2MB 제한을 넘어서 Storage를 씁니다).
//   2) 서버 메모리의 원본(base): 인스턴스가 새로 뜨면 공공 API 대신 스냅샷 파일 하나만 받습니다.
//   3) 화면용 목록(visible): 관리자가 숨긴 장소(hidden_public_places)를 5분마다 다시 빼서 씁니다
//      — 숨김 처리가 스냅샷 갱신을 기다리지 않고 바로 반영되도록 스냅샷에는 숨김을 굽지 않습니다.
// 스냅샷이 없거나(첫 배포) 너무 오래됐으면(크론 실패 등) 예전처럼 공공 API에서 직접 만들고
// 그 결과를 스냅샷으로 저장합니다.

const SNAPSHOT_BUCKET = "public-data-cache";
const SNAPSHOT_PATH = "merged-v1.json.gz";
/** 이보다 오래된 스냅샷은 버리고 공공 API에서 새로 만듭니다(크론이 하루 이틀 실패해도 버팀). */
const SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** 서버 메모리의 원본을 이 주기로 스냅샷에서 다시 받습니다(크론 갱신분 반영). */
const BASE_TTL_MS = 60 * 60 * 1000;
/** 숨김 장소를 이 주기로 다시 반영합니다. */
const VISIBLE_TTL_MS = 5 * 60_000;

let base: any[] | null = null;
let baseAt = 0;
let cachedRaw: any[] | null = null;
let cachedAt = 0;
// 지금 만들고 있는 목록 — 동시에 온 요청들이 같은 작업 하나를 함께 기다립니다.
let inFlight: Promise<any[]> | null = null;
// 출처별 마지막 성공 결과 — 한 출처(특히 외부 관광공사 API)가 이번에 실패해도 그 장소들이
// 목록에서 통째로 사라지지 않게(열려 있던 상세페이지가 "찾을 수 없음"이 되지 않게) 씁니다.
let lastGood: { tour: any[]; food: any[]; culture: any[] } = { tour: [], food: [], culture: [] };

// 스냅샷 읽기/쓰기는 Storage 권한이 필요해서 서버 전용 service role 클라이언트를 씁니다.
let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

async function loadSnapshot(): Promise<{ builtAt: number; places: any[] } | null> {
  const client = admin();
  if (!client) return null;
  try {
    const { data, error } = await client.storage.from(SNAPSHOT_BUCKET).download(SNAPSHOT_PATH);
    if (error || !data) return null;
    const json = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8"));
    if (!Array.isArray(json?.places) || typeof json?.builtAt !== "number") return null;
    return json;
  } catch (e) {
    console.error("[publicDataAggregate] 스냅샷 읽기 실패:", e);
    return null;
  }
}

async function saveSnapshot(places: any[]): Promise<boolean> {
  const client = admin();
  if (!client || places.length === 0) return false;
  try {
    // 버킷이 없으면 만듭니다(비공개 — 서버만 읽음). 이미 있으면 오류가 나지만 무시합니다.
    await client.storage.createBucket(SNAPSHOT_BUCKET, { public: false }).catch(() => {});
    const body = gzipSync(Buffer.from(JSON.stringify({ builtAt: Date.now(), places }), "utf8"));
    const { error } = await client.storage
      .from(SNAPSHOT_BUCKET)
      .upload(SNAPSHOT_PATH, body, { upsert: true, contentType: "application/gzip" });
    if (error) {
      console.error("[publicDataAggregate] 스냅샷 저장 실패:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[publicDataAggregate] 스냅샷 저장 실패:", e);
    return false;
  }
}

async function applyHidden(list: any[]): Promise<any[]> {
  const { data, error } = await supabase.from("hidden_public_places").select("place_id");
  if (error || !data || data.length === 0) return list;
  const hiddenIds = new Set(data.map((r: any) => Number(r.place_id)));
  return list.filter((p) => !hiddenIds.has(p.id));
}

async function refresh(): Promise<any[]> {
  if (!base || Date.now() - baseAt >= BASE_TTL_MS) {
    const snap = await loadSnapshot();
    if (snap && snap.places.length > 0 && Date.now() - snap.builtAt < SNAPSHOT_MAX_AGE_MS) {
      base = snap.places;
      baseAt = Date.now();
    } else {
      const built = await buildFromSources();
      if (built.length > 0) {
        base = built;
        baseAt = Date.now();
        await saveSnapshot(built);
      } else if (snap && snap.places.length > 0) {
        // 공공 API가 전부 실패하면 오래된 스냅샷이라도 씁니다(빈 지도보다 낫습니다).
        base = snap.places;
        baseAt = Date.now();
      }
    }
  }
  const visible = await applyHidden(base ?? []);
  cachedRaw = visible;
  cachedAt = Date.now();
  return visible;
}

/**
 * 공공데이터 3종 병합 목록.
 * 만료돼도 기존 목록으로 바로 응답하고 새 목록은 뒤에서 만듭니다(stale-while-revalidate).
 * 처음(캐시가 아예 없을 때)만 만들어질 때까지 기다립니다.
 */
export async function getMergedPublicDataPlaces(): Promise<any[]> {
  const fresh = cachedRaw && Date.now() - cachedAt < VISIBLE_TTL_MS;
  if (fresh) return cachedRaw!;
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  if (cachedRaw) {
    inFlight.catch(() => {}); // 뒤에서 갱신 — 실패해도 기존 목록을 계속 씁니다
    return cachedRaw;
  }
  return inFlight;
}

/**
 * 크론 전용: 공공 API에서 전체 목록을 새로 만들어 스냅샷으로 저장합니다.
 * 결과(건수·저장 성공 여부)를 돌려줘서 크론 로그에서 확인할 수 있게 합니다.
 */
export async function rebuildPublicDataSnapshot(): Promise<{ count: number; saved: boolean }> {
  const built = await buildFromSources();
  if (built.length === 0) return { count: 0, saved: false };
  const saved = await saveSnapshot(built);
  base = built;
  baseAt = Date.now();
  cachedRaw = null; // 다음 요청에서 숨김 장소를 다시 반영
  return { count: built.length, saved };
}

async function buildFromSources(): Promise<any[]> {
  const [tourResult, foodResult, cultureResult] = await Promise.allSettled([
    getTourPlaces(),
    fetchFoodsafetyPlaces(),
    fetchCulturePlaces(),
  ]);

  const pick = (result: PromiseSettledResult<any[]>, key: keyof typeof lastGood) => {
    const items = result.status === "fulfilled" ? result.value : [];
    if (items.length > 0) lastGood[key] = items;
    return lastGood[key];
  };
  const tourItems = pick(tourResult, "tour");
  const foodItems = pick(foodResult, "food");
  const cultureItems = pick(cultureResult, "culture");

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

  return mapped;
}
