import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// 관리자가 사장님 프리미엄 신청을 승인/거절하는 라우트입니다.
// admin/delete-place 등 기존 관리자 라우트와 동일한 인증 패턴(service role +
// users.is_admin 확인)을 그대로 씁니다.
//
// action: "approve" | "reject"
// approve → places.is_premium=true, premium_expires_at = 지금부터 신청한 개월 수 뒤로 설정
//           (이미 프리미엄이 진행 중인 장소를 연장 승인하는 경우, 기존 만료일이 아직
//            남아있으면 그 시점부터 이어서 연장합니다 — 남은 기간을 날리지 않기 위함)
// reject  → premium_requests.status만 rejected로 변경(places는 건드리지 않음)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "인증 정보 없음" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });

    const { data: adminProfile } = await supabaseAdmin
      .from("users")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .single();
    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
    }

    const body = await req.json();
    const requestId = Number(body.requestId);
    const action = body.action as "approve" | "reject";
    const adminNote = typeof body.adminNote === "string" ? body.adminNote.slice(0, 300) : null;

    if (!requestId || isNaN(requestId) || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "요청이 올바르지 않습니다" }, { status: 400 });
    }

    const { data: reqRow, error: reqError } = await supabaseAdmin
      .from("premium_requests")
      .select("id, place_id, months, status")
      .eq("id", requestId)
      .single();
    if (reqError || !reqRow) {
      return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다" }, { status: 404 });
    }
    if (reqRow.status !== "pending") {
      return NextResponse.json({ error: "이미 처리된 신청입니다" }, { status: 409 });
    }

    if (action === "reject") {
      const { error } = await supabaseAdmin
        .from("premium_requests")
        .update({ status: "rejected", admin_note: adminNote, processed_at: new Date().toISOString(), processed_by: user.email || user.id })
        .eq("id", requestId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── 승인: 만료일 계산(기존 만료일이 아직 유효하면 거기서부터 이어서 연장)
    const { data: placeRow } = await supabaseAdmin
      .from("places")
      .select("premium_expires_at")
      .eq("id", reqRow.place_id)
      .single();

    const now = Date.now();
    const currentExpiry = placeRow?.premium_expires_at ? new Date(placeRow.premium_expires_at).getTime() : 0;
    const base = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(base + reqRow.months * 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: placeUpdateError } = await supabaseAdmin
      .from("places")
      .update({ is_premium: true, premium_expires_at: newExpiry })
      .eq("id", reqRow.place_id);
    if (placeUpdateError) return NextResponse.json({ error: placeUpdateError.message }, { status: 500 });

    const { error: reqUpdateError } = await supabaseAdmin
      .from("premium_requests")
      .update({ status: "approved", admin_note: adminNote, processed_at: new Date().toISOString(), processed_by: user.email || user.id })
      .eq("id", requestId);
    if (reqUpdateError) return NextResponse.json({ error: reqUpdateError.message }, { status: 500 });

    return NextResponse.json({ success: true, premiumExpiresAt: newExpiry });
  } catch (e) {
    console.error("[/api/admin/premium] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
