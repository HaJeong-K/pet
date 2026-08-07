// app/api/admin/hide-public-place/route.ts
//
// 공공데이터(관광공사·문화정보원·식품안전나라) 출처 장소는 Supabase `places`
// 테이블에 실제 행이 없어서 delete-place 라우트로는 지울 수 없습니다. 대신
// hidden_public_places 테이블에 id를 올려서, publicDataPlaces.ts가 다음부터
// 불러올 때 걸러내도록 합니다(scripts/sql/add-hidden-public-places.sql 참고).
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // ── 1. 관리자 인증 (delete-place와 동일한 방식)
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
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;

    if (!placeId || isNaN(placeId)) {
      return NextResponse.json({ error: "placeId 오류" }, { status: 400 });
    }

    // ── 3. 차단 목록에 upsert
    const { error } = await supabaseAdmin
      .from("hidden_public_places")
      .upsert([{ place_id: placeId, reason, hidden_by: user.email || user.id }], { onConflict: "place_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[hide-public-place] 예외:", err);
    return NextResponse.json(
      { error: err.message || "서버 오류" },
      { status: 500 }
    );
  }
}
