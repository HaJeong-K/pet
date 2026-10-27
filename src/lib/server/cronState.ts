// src/lib/server/cronState.ts
//
// 새벽 작업이 "어제와 비교"하려고 남겨 두는 기록(서버 전용).
//   · 관광공사 목록(장소 번호·이름) — 오늘 목록과 비교해 빠진 곳·새로 생긴 곳을 알림에 보여 줍니다.
//   · 지도 장소 수(공공데이터별) — 어제보다 몇 곳 늘고 줄었는지 보여 줍니다.
// 보관: Supabase Storage 비공개 버킷 public-data-cache의 파일 하나(cron-state-v1.json.gz, 약 100KB).
// 문구 규칙은 src/lib/cronDigest.ts.

import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { diffTourList, isSuspiciousDrop, type MapCounts, type TourEntry } from "@/lib/cronDigest";

const BUCKET = "public-data-cache";
const PATH = "cron-state-v1.json.gz";

type CronState = { tourList?: TourEntry[]; tourListAt?: string; mapCounts?: MapCounts; mapCountsAt?: string };

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function loadState(): Promise<CronState> {
  const { data, error } = await admin().storage.from(BUCKET).download(PATH);
  if (error || !data) return {};
  try { return JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as CronState; } catch { return {}; }
}

async function saveState(state: CronState): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await client.storage.from(BUCKET)
    .upload(PATH, gzipSync(Buffer.from(JSON.stringify(state), "utf8")), { upsert: true, contentType: "application/gzip" });
  if (error) throw new Error(`비교 기록 저장 실패: ${error.message}`);
}

export type TourListCheck = { total: number; prevTotal: number | null; added: TourEntry[]; removed: TourEntry[]; suspicious: boolean };

/**
 * 오늘 받은 관광공사 목록을 어제 목록과 비교하고, 정상이면 오늘 목록을 새 기준으로 저장합니다.
 * 목록이 비었거나 10% 넘게 줄면 '받다 만 목록'으로 보고 기준을 바꾸지 않습니다(다음 날 다시 비교).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkTourList(items: any[]): Promise<TourListCheck> {
  const next: TourEntry[] = items.map((it) => ({ id: String(it.contentid), name: String(it.title ?? "").trim() }));
  const state = await loadState();
  const prev = state.tourList ?? null;
  if (!prev) {
    await saveState({ ...state, tourList: next, tourListAt: new Date().toISOString() });
    return { total: next.length, prevTotal: null, added: [], removed: [], suspicious: false };
  }
  if (isSuspiciousDrop(prev.length, next.length)) {
    return { total: next.length, prevTotal: prev.length, added: [], removed: [], suspicious: true };
  }
  const { added, removed } = diffTourList(prev, next);
  await saveState({ ...state, tourList: next, tourListAt: new Date().toISOString() });
  return { total: next.length, prevTotal: prev.length, added, removed, suspicious: false };
}

/** 오늘 지도 장소 수를 저장하고 어제 수를 돌려줍니다(처음이면 null). */
export async function recordMapCounts(now: MapCounts): Promise<MapCounts | null> {
  const state = await loadState();
  const prev = state.mapCounts ?? null;
  await saveState({ ...state, mapCounts: now, mapCountsAt: new Date().toISOString() });
  return prev;
}
