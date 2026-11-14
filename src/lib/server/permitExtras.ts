// src/lib/server/permitExtras.ts
//
// 행정안전부 인허가 데이터에서 전화번호 말고 더 받을 수 있는 정보 보관소(서버 전용) — 2026-11-13
//   · 음식점·카페·제과점: 업태(한식·경양식·커피숍 등), 홈페이지
//   · 숙박업·민박·펜션·한옥: 객실 수
//   · 모든 업종: 인허가일(영업을 시작한 해)
// 표를 바꾸지 않고(Supabase Storage 파일 하나 — permit-extras-v1.json.gz) 장소 번호별로 쌓아 둡니다.
// 장소 상세를 열 때(/api/public-data/place/[id]) 이 파일과 public_place_permits 표를 합쳐 "인허가 정보"로 보여 줍니다.
// 영업시간·휴무일·주차는 인허가 데이터에 없습니다(공공데이터로는 관광공사 상세에만 있음).

import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import type { PermitExtra } from "@/lib/permitMatch";

const BUCKET = "public-data-cache";
const PATH = "permit-extras-v1.json.gz";
const MEM_TTL_MS = 10 * 60_000;

export type PermitExtraMap = Record<string, PermitExtra>;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let mem: { map: PermitExtraMap; at: number } | null = null;

export async function loadPermitExtras(force = false): Promise<PermitExtraMap> {
  if (!force && mem && Date.now() - mem.at < MEM_TTL_MS) return mem.map;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return {};
  try {
    const { data, error } = await admin().storage.from(BUCKET).download(PATH);
    if (error || !data) { mem = { map: {}, at: Date.now() }; return mem.map; }
    const map = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as PermitExtraMap;
    mem = { map, at: Date.now() };
    return map;
  } catch {
    return mem?.map ?? {};
  }
}

/** 새로 받은 것을 기존 파일에 합쳐 저장합니다(빈 값만 있는 항목은 "확인함" 표시로 남겨 다시 묻지 않게). */
export async function mergePermitExtras(added: PermitExtraMap): Promise<boolean> {
  if (Object.keys(added).length === 0) return true;
  const current = await loadPermitExtras(true);
  const map = { ...current, ...added };
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const body = gzipSync(Buffer.from(JSON.stringify(map), "utf8"));
  const { error } = await client.storage.from(BUCKET).upload(PATH, body, { upsert: true, contentType: "application/gzip" });
  if (error) { console.error("[permitExtras] 저장 실패:", error.message); return false; }
  mem = { map, at: Date.now() };
  return true;
}
