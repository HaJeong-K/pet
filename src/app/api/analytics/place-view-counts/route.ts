import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// 지도 리스트 패널에 "최근 조회수"를 보여주기 위한 공개 집계 라우트입니다.
// analytics_events에 이미 쌓이고 있는 place_view 이벤트(장소 상세를 열 때마다 기록됨)를
// 최근 30일치만 읽어와 장소별로 개수를 셉니다. 로그인 여부와 무관하게 지도를 보는
// 모든 사용자에게 필요해서 관리자 인증 없이 공개로 둡니다(개인정보 없이 place_id
// 카운트만 내려줍니다). 집계 방식은 /api/admin/analytics와 동일하게 서버에서 raw
// 이벤트를 가져와 JS로 세는 방식을 그대로 따릅니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

export async function GET() {
  try {
    const since = new Date(Date.now() - RECENT_DAYS * DAY_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("analytics_events")
      .select("place_id")
      .eq("event_type", "place_view")
      .gte("created_at", since)
      .not("place_id", "is", null)
      .limit(50000);

    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const id = row.place_id as string | null;
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
    }

    return NextResponse.json({ counts });
  } catch (e) {
    console.error("[/api/analytics/place-view-counts] failed:", e);
    return NextResponse.json({ counts: {} }, { status: 200 });
  }
}
