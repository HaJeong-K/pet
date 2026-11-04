// src/lib/server/permitPhones.ts
//
// 인허가 데이터로 맞춘 결과(public_place_permits) 읽기 — 지도 목록(src/lib/publicDataAggregate.ts)과
// 매일 새벽 채우기(src/lib/server/permitEnrich.ts)가 함께 씁니다(서로를 불러오지 않도록 따로 둠).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** 표 전체를 1,000줄씩 나눠 읽습니다(한 번에 1,000줄까지만 돌려주므로) */
export async function loadPermitRows(db: SupabaseClient, columns: string[], onlyMatched = false): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("public_place_permits").select(columns.join(", ")).order("place_id").range(from, from + 999);
    if (onlyMatched) q = q.eq("matched", true);
    const { data, error } = await q;
    if (error || !data) break;
    out.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return out;
}

/** 폐업한 지 이만큼 지난 곳은 지도에서 자동으로 숨깁니다(그보다 최근이면 관리자 신고 목록에서 사람이 확인) — 2026-11-04 대표 결정 */
export const CLOSED_HIDE_DAYS = 365;

/** 폐업일("2024-01-01" 또는 "20240101")이 CLOSED_HIDE_DAYS보다 오래됐는지. 날짜를 모르면 false */
export function closedLongAgo(closedOn: string | null | undefined, now = Date.now()): boolean {
  const d = (closedOn ?? "").replace(/\D/g, "");
  if (d.length !== 8) return false;
  const t = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00+09:00`);
  return Number.isFinite(t) && now - t > CLOSED_HIDE_DAYS * 86_400_000;
}

/**
 * 지도 목록용: 맞춘 인허가 기록의 전화번호(place_id → 전화번호)와, 폐업한 지 1년이 넘어 숨길 장소.
 * 표가 없거나 읽지 못하면 빈 값.
 */
export async function loadPermitInfo(): Promise<{ phones: Map<number, string>; closed: Set<number> }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { phones: new Map(), closed: new Set() };
  const rows = await loadPermitRows(admin(), ["place_id", "phone", "status", "closed_on"], true).catch(() => []);
  return {
    phones: new Map(rows.filter((r) => r.phone && r.status !== "closed").map((r) => [Number(r.place_id), String(r.phone)])),
    closed: new Set(rows.filter((r) => r.status === "closed" && closedLongAgo(r.closed_on as string | null)).map((r) => Number(r.place_id))),
  };
}
