// src/lib/server/shelterThumbs.ts
//
// 줄여 둔 유기동물 공고 사진 보관소(서버 전용) — /api/shelter-image가 쓰고, 새벽 자동 작업이 오래된 것을 지웁니다.
import { createClient } from "@supabase/supabase-js";

export const THUMB_BUCKET = "shelter-thumbs";
/** 공고는 보통 10일쯤 게시되므로, 이보다 오래된 보관분은 지웁니다. */
const KEEP_DAYS = 30;

export function thumbStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).storage;
}

/** 오래된 보관분 삭제. 지운 수를 돌려줍니다(버킷이 아직 없으면 0). */
export async function cleanupShelterThumbs(): Promise<{ removed: number; kept: number }> {
  const store = thumbStorage();
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const old: string[] = [];
  let kept = 0;
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await store.from(THUMB_BUCKET).list("", { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error || !data || data.length === 0) break;
    for (const file of data) {
      const created = file.created_at ? new Date(file.created_at).getTime() : Date.now();
      if (created < cutoff) old.push(file.name); else kept++;
    }
    // 만든 순서대로 받으므로, 이번 묶음에 최근 것이 섞여 있으면 그 뒤는 모두 최근 것입니다.
    if (data.length < 1000 || kept > 0) break;
  }
  let removed = 0;
  for (let i = 0; i < old.length; i += 100) {
    const { data } = await store.from(THUMB_BUCKET).remove(old.slice(i, i + 100));
    removed += data?.length ?? 0;
  }
  return { removed, kept };
}
