import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// analytics_events insert 전용 — RLS를 신경 쓸 필요 없이(공개 익명 이벤트 기록) service
// role로 씁니다. 실패해도 200을 반환해 클라이언트 쪽 UX에 영향이 없게 합니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, userKey, authUserId, path, query, placeId, placeName, region, subRegion } = body || {};
    if (!eventType) return NextResponse.json({ ok: false }, { status: 200 });

    await supabaseAdmin.from("analytics_events").insert([
      {
        event_type: eventType,
        user_key: userKey || null,
        auth_user_id: authUserId || null,
        path: path || null,
        query: query || null,
        place_id: placeId || null,
        place_name: placeName || null,
        region: region || null,
        sub_region: subRegion || null,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/analytics/track] failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
