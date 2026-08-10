// app/api/admin/delete-public-data-place/route.ts
//
// 공공데이터 출처 장소 중에서도 "CSV로 미리 반입해둔 것"(식품안전나라 →
// foodsafety_restaurants, 한국문화정보원 → culture_facilities)은 관광공사 실시간 API
// 출처와 달리 우리 Supabase에 원본 행이 실제로 있습니다. 그래서 hidden_public_places로
// 가리는 대신 원본 행 자체를 지울 수 있습니다 — 지우고 나면 fetchPublicDataPlaces()가
// 다음부터 아예 불러오지 않으니 "완전 삭제"가 됩니다.
//
// 관광공사(tour) 실시간 API 출처는 우리 쪽에 저장된 행이 없어서(매번 API로 새로
// 받아옴) 이 라우트를 쓸 수 없고, 계속 hide-public-place(숨김)를 씁니다.
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { purgePlaceRecords } from "@/lib/purgePlaceRecords";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// sourceId 형식: "foodsafety-123" / "culture-456" (src/lib/foodsafetyPlaces.ts,
// src/lib/culturePlaces.ts가 원본 테이블의 id 컬럼으로 만듭니다)
const SOURCE_TABLE: Record<string, string> = {
  foodsafety: "foodsafety_restaurants",
  culture: "culture_facilities",
};

export async function POST(req: NextRequest) {
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

    // ── 2. 입력 파싱
    const body = await req.json();
    const placeId = Number(body.placeId); // fetchPublicDataPlaces()가 부여한 합성 id (analytics/리뷰 등에 쓰인 값)
    const sourceId: string | undefined = body.sourceId; // 예: "foodsafety-123"
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;

    if (!placeId || isNaN(placeId)) {
      return NextResponse.json({ error: "placeId 오류" }, { status: 400 });
    }
    if (!sourceId || typeof sourceId !== "string") {
      return NextResponse.json({ error: "sourceId 오류" }, { status: 400 });
    }

    const match = sourceId.match(/^([a-z]+)-(.+)$/);
    const source = match?.[1];
    const rawId = match?.[2];
    const table = source ? SOURCE_TABLE[source] : undefined;

    if (!table || !rawId) {
      return NextResponse.json(
        { error: `이 소스(${sourceId})는 완전 삭제를 지원하지 않습니다. 실시간 API 출처는 '숨기기'만 가능합니다.` },
        { status: 400 }
      );
    }

    // ── 3. 원본 테이블에서 실제 행 삭제
    const { error: deleteError } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("id", rawId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // ── 4. 혹시 모를 캐시(fetchPublicDataPlaces 5분 TTL) 대비 안전장치로 숨김 목록에도 올려둡니다.
    await supabaseAdmin
      .from("hidden_public_places")
      .upsert([{ place_id: placeId, reason, hidden_by: user.email || user.id }], { onConflict: "place_id" });

    // ── 5. 이 장소에 딸린 리뷰·이미지·반응·통계 기록 정리
    await purgePlaceRecords(supabaseAdmin, placeId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[delete-public-data-place] 예외:", err);
    return NextResponse.json(
      { error: err.message || "서버 오류" },
      { status: 500 }
    );
  }
}
