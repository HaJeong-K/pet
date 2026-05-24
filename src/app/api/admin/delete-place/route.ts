// app/api/admin/delete-place/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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

    // ── 3. 리뷰 ID 목록 조회
    const { data: reviews } = await supabaseAdmin
      .from("reviews")
      .select("id")
      .eq("place_id", placeId);

    const reviewIds = (reviews || []).map((r: any) => r.id);

    // ── 4. 답글 ID 목록 조회 → reply_likes 삭제
    if (reviewIds.length > 0) {
      const { data: replyRows } = await supabaseAdmin
        .from("review_replies")
        .select("id")
        .in("review_id", reviewIds);

      const replyIds = (replyRows || []).map((r: any) => r.id);

      if (replyIds.length > 0) {
        await supabaseAdmin
          .from("reply_likes")
          .delete()
          .in("reply_id", replyIds);
      }

      // 답글·리뷰 좋아요 삭제
      await Promise.all([
        supabaseAdmin.from("review_replies").delete().in("review_id", reviewIds),
        supabaseAdmin.from("review_likes").delete().in("review_id", reviewIds),
      ]);
    }

    // ── 5. 장소 관련 전체 삭제
    await Promise.all([
      supabaseAdmin.from("reviews").delete().eq("place_id", placeId),
      supabaseAdmin.from("place_images").delete().eq("place_id", placeId),
      supabaseAdmin.from("reactions").delete().eq("place_id", placeId),
      supabaseAdmin
        .from("reports")
        .update({ is_resolved: true })
        .eq("place_id", placeId),
    ]);

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