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

/** 지도 목록용: 맞춘 인허가 기록의 전화번호(place_id → 전화번호). 표가 없거나 읽지 못하면 빈 목록 */
export async function loadPermitPhones(): Promise<Map<number, string>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return new Map();
  const rows = await loadPermitRows(admin(), ["place_id", "phone"], true).catch(() => []);
  return new Map(rows.filter((r) => r.phone).map((r) => [Number(r.place_id), String(r.phone)]));
}
