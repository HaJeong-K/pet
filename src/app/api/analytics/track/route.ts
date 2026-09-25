import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// analytics_events insert 전용 — RLS를 신경 쓸 필요 없이(공개 익명 이벤트 기록) service
// role로 씁니다. 실패해도 200을 반환해 클라이언트 쪽 UX에 영향이 없게 합니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_EVENT_TYPES = new Set([
  "page_view",
  "search",
  "place_view",
  "rec_impression",
  "rec_click",
  "course_impression",
  "course_regenerate",
  "course_stop_click",
  "course_start",
]);

// 익명 공개 엔드포인트라 meta에 임의의 큰 JSON을 넣어 테이블을 부풀리지 못하도록 크기를 제한합니다.
const MAX_META_BYTES = 4000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, userKey, authUserId, path, query, placeId, placeName, region, subRegion, variant, meta } = body || {};
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) return NextResponse.json({ ok: false }, { status: 200 });

    let safeMeta: unknown = null;
    if (meta && typeof meta === "object") {
      const serialized = JSON.stringify(meta);
      if (serialized.length <= MAX_META_BYTES) safeMeta = meta;
    }

    const row: Record<string, unknown> = {
      event_type: eventType,
      user_key: userKey || null,
      auth_user_id: authUserId || null,
      path: path || null,
      query: query || null,
      place_id: placeId || null,
      place_name: placeName || null,
      region: region || null,
      sub_region: subRegion || null,
    };
    const hasExtended = variant != null || safeMeta != null;
    if (variant != null) row.variant = String(variant).slice(0, 16);
    if (safeMeta != null) row.meta = safeMeta;

    const { error } = await supabaseAdmin.from("analytics_events").insert([row]);
    // scripts/sql/recommendation-v2.sql(variant/meta 컬럼)을 아직 실행하지 않은 DB라면
    // 컬럼이 없어 insert가 실패합니다 — 그 경우에도 기본 이벤트는 잃지 않도록 확장
    // 필드를 빼고 한 번 더 기록합니다.
    if (error && hasExtended) {
      delete row.variant;
      delete row.meta;
      await supabaseAdmin.from("analytics_events").insert([row]);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/analytics/track] failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
