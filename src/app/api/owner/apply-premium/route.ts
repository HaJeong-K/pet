import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizePlan } from "@/lib/ownerPlans";
import { createPremiumRequest } from "@/lib/server/premiumRequest";

// 인증된 사장님이 본인 업장의 "프리미엄 등록"을 신청할 때 쓰는 라우트입니다.
// update-place/route.ts와 동일한 이유로 service role을 씁니다: 클라이언트(anon key)로
// 직접 insert하면 RLS에 막히고, 무엇보다 "이 사람이 정말 이 장소의 인증된 사장님인가"를
// 서버에서 다시 확인해야 다른 사람이 남의 장소로 신청을 넣는 걸 막을 수 있습니다.
//
// 결제대행(PG) 연동 전이라, 신청은 무통장입금 등 오프라인 결제를 전제로 하고 상태를
// pending으로만 만듭니다 — 실제 활성화(is_premium=true)는 관리자가 입금 확인 후
// /api/admin/premium/approve로 승인해야 이뤄집니다.
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
      .from("users")
      .select("owner_status, owner_place_id, is_admin")
      .eq("auth_user_id", user.id)
      .single();

    const body = await req.json().catch(() => ({}));
    // 프리미엄 신청은 인증된 사장님 본인만 할 수 있습니다 — 돈이 오가는 계약이라 관리자도 대신 신청할 수 없습니다.
    // 대상 업장은 항상 본인 업장으로 고정합니다(요청 바디의 placeId는 보지 않음).
    const isOwner = profile?.owner_status === "verified" && !!profile?.owner_place_id;
    if (!isOwner) {
      return NextResponse.json({ error: "프리미엄 신청은 인증된 사장님 본인 계정에서만 할 수 있어요" }, { status: 403 });
    }
    const targetPlaceId = profile!.owner_place_id;

    // 신청하는 요금제 단계(모르는 값은 가장 낮은 '프리미엄')
    const plan = normalizePlan(body?.plan);
    const months = Number(body?.months) > 0 ? Math.min(Math.floor(Number(body.months)), 12) : 1;
    const payerName = typeof body?.payerName === "string" ? body.payerName.slice(0, 40) : null;
    const rawMemo = typeof body?.memo === "string" ? body.memo.slice(0, 480) : "";
    // 할인 계산·중복 확인·저장·관리자 알림은 자동 연장과 같은 함수(src/lib/server/premiumRequest.ts)
    const result = await createPremiumRequest({ placeId: Number(targetPlaceId), ownerUserId: user.id, plan, months, payerName, memo: rawMemo || null });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/owner/apply-premium] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
