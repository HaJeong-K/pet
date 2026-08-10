// app/api/admin/delete-place/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { purgePlaceRecords } from "@/lib/purgePlaceRecords";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(req: NextRequest) {
  try {
    // ── 1. 관리자 인증
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "인증 정보 없음" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
    }

    // ── 2. placeId 파싱
    const body = await req.json();
    const placeId = Number(body.placeId);

    if (!placeId || isNaN(placeId)) {
      return NextResponse.json({ error: "placeId 오류" }, { status: 400 });
    }

    // ── 3~5. 리뷰/답글/좋아요/이미지/반응/신고/통계 기록 정리 (공용 로직 — hide-public-place,
    // delete-public-data-place 라우트와 동일한 순서로 처리합니다. src/lib/purgePlaceRecords.ts 참고)
    await purgePlaceRecords(supabaseAdmin, placeId);

    // ── 6. 장소 본체 삭제
    const { error: placeError } = await supabaseAdmin
      .from("places")
      .delete()
      .eq("id", placeId);

    if (placeError) {
      return NextResponse.json(
        { error: placeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[delete-place] 예외:", err);
    return NextResponse.json(
      { error: err.message || "서버 오류" },
      { status: 500 }
    );
  }
}