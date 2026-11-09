// src/lib/server/parksSync.ts
//
// 전국도시공원정보표준데이터 오픈API → Supabase parks 테이블 동기화(서버 전용).
// scripts/import-parks.mjs(손으로 실행하던 1회성 스크립트)와 같은 규칙으로 가공하며, 이제는
// 자동 작업(/api/cron/daily)이 주 1회 부릅니다. 같은 공원은 source_key로 덮어씁니다(upsert).

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api";
const NUM_OF_ROWS = 1000;
const MAX_PAGES = 60; // 전국 공원 약 2만 곳 — 넉넉한 안전 상한
const UPSERT_BATCH = 500;
const FETCH_TIMEOUT_MS = 15_000;

const toArray = <T,>(v: T | T[] | undefined | null): T[] => (!v ? [] : Array.isArray(v) ? v : [v]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pick(item: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = item?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

const FACILITY_FIELDS: [string, string, string][] = [
  ["mvmFclty", "MVM_FCLTY", "운동시설"],
  ["amsmtFclty", "AMSMT_FCLTY", "유희시설"],
  ["cnvnncFclty", "CNVNNC_FCLTY", "편익시설"],
  ["cltrFclty", "CLTR_FCLTY", "교양시설"],
  ["etcFclty", "ETC_FCLTY", "기타시설"],
];
function buildFacilityNote(item: any): string | null {
  const parts = FACILITY_FIELDS
    .map(([camel, upper, label]) => [label, pick(item, camel, upper).trim()] as const)
    .filter(([, v]) => v)
    .map(([label, v]) => `${label}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function serviceKey(): string | null {
  const key = process.env.PARK_OPEN_API_KEY;
  if (!key) return null;
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

async function fetchPage(key: string, pageNo: number): Promise<{ items: any[]; totalCount: number }> {
  const qs = new URLSearchParams({ pageNo: String(pageNo), numOfRows: String(NUM_OF_ROWS), type: "json" });
  const res = await fetch(`${API_BASE}?serviceKey=${key}&${qs}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} / JSON 아님`); }
  const gatewayError = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gatewayError) throw new Error(`게이트웨이 오류 [${gatewayError.returnReasonCode}] ${gatewayError.errMsg}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // 이 API는 { response: {...} } 래핑 없이 최상위에 header/body가 옵니다(두 형태 다 대응).
  const header = json?.header ?? json?.response?.header;
  if (header && header.resultCode !== "00") throw new Error(`API 오류 [${header.resultCode}] ${header.resultMsg}`);
  const body = json?.body ?? json?.response?.body;
  return { items: toArray(body?.items?.item), totalCount: Number(body?.totalCount ?? 0) };
}

async function fetchPageWithRetry(key: string, pageNo: number): Promise<{ items: any[]; totalCount: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchPage(key, pageNo);
    } catch (e) {
      lastError = e;
      if (attempt < 3) await sleep(attempt * 3000);
    }
  }
  throw lastError;
}

export async function syncParks(): Promise<{ fetched: number; upserted: number }> {
  const key = serviceKey();
  if (!key) throw new Error("PARK_OPEN_API_KEY 환경변수가 없습니다.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !adminKey) throw new Error("Supabase 서버 키가 없습니다.");
  const supabase = createClient(url, adminKey, { auth: { persistSession: false } });

  const all: any[] = [];
  let totalCount = Infinity;
  for (let pageNo = 1; (pageNo - 1) * NUM_OF_ROWS < totalCount && pageNo <= MAX_PAGES; pageNo++) {
    const { items, totalCount: total } = await fetchPageWithRetry(key, pageNo);
    totalCount = total;
    if (items.length === 0) break;
    all.push(...items);
    await sleep(200);
  }

  // 관리번호(manageNo)는 전국에서 하나뿐인 번호가 아닙니다 — 관리 기관이 다르면 같은 번호를 씁니다
  // (예: 대구 "두류공원"(두류공원관리사무소)과 "한빛어린이공원"(달서구청)이 둘 다 27290-00179).
  // 예전에는 번호만 보고 같은 공원으로 여겨 두류공원 같은 큰 공원이 빠졌습니다(2026-11-09 수정).
  // 이미 저장된 공원은 번호(=장소 번호)가 바뀌지 않게 원래 키를 그대로 쓰고,
  // 같은 번호에 이름이 다른 공원만 "번호|이름" 키로 따로 저장합니다.
  const existingName = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("parks").select("source_key, name").range(from, from + 999);
    if (error) throw new Error(`기존 공원 목록 읽기 실패: ${error.message}`);
    for (const r of data ?? []) existingName.set(r.source_key, r.name);
    if (!data || data.length < 1000) break;
  }
  const plainOwner = new Map<string, string>(); // 이번 동기화에서 원래 키를 차지한 공원 이름

  const seen = new Set<string>();
  const rows: any[] = [];
  for (const item of all) {
    const name = pick(item, "parkNm", "PARK_NM").trim();
    const lat = pick(item, "latitude", "LATITUDE").trim();
    const lng = pick(item, "longitude", "LONGITUDE").trim();
    const latNum = Number(lat), lngNum = Number(lng);
    if (!name || !Number.isFinite(latNum) || !Number.isFinite(lngNum) || (latNum === 0 && lngNum === 0)) continue;
    const manageNo = pick(item, "manageNo", "MANAGE_NO").trim();
    const address = pick(item, "rdnmadr", "RDNMADR", "lnmadr", "LNMADR").trim();
    const base = `park-${manageNo || `${name}|${address}`}`;
    const stored = existingName.get(base);
    const owner = plainOwner.get(base);
    const takesPlain = stored ? stored === name : (owner === undefined || owner === name);
    const sourceKey = takesPlain ? base : `${base}|${name}`;
    if (takesPlain) plainOwner.set(base, name);
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    const parkAr = pick(item, "parkAr", "PARK_AR");
    rows.push({
      source_key: sourceKey,
      name,
      category: pick(item, "parkSe", "PARK_SE").trim() || "공원",
      address,
      lat,
      lng,
      area: parkAr || null,
      management_agency: pick(item, "institutionNm", "INSTITUTION_NM").trim() || null,
      phone: pick(item, "phoneNumber", "PHONE_NUMBER").trim() || null,
      facility_note: buildFacilityNote(item),
    });
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from("parks").upsert(batch, { onConflict: "source_key" });
    if (error) {
      console.error(`[parksSync] 배치 ${i / UPSERT_BATCH + 1} 저장 실패:`, error.message);
      continue;
    }
    upserted += batch.length;
  }
  return { fetched: all.length, upserted };
}
