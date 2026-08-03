import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// 사장님 가입 신청 승인/반려 — service role로 처리합니다(관리자 client 직접 write는
// RLS에 막혀 조용히 실패한 전례가 있어 이 시스템 전체를 이 패턴으로 통일했습니다).
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

    const { data: profile } = await supabaseAdmin
      .from("users").select("is_admin").eq("auth_user_id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });

    const body = await req.json();
    const { userId, action, placeId } = body as { userId: string; action: "approve" | "reject"; placeId?: number };
    if (!userId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      owner_status: action === "approve" ? "verified" : "rejected",
    };
    if (action === "approve" && placeId) update.owner_place_id = placeId;

    const { error } = await supabaseAdmin.from("users").update(update).eq("auth_user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/admin/owners/verify] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
