import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/server/notify";
import { quote, won } from "@/lib/ownerPlans";

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
    // 관리자는 사장님 요청에 따라 대신 신청할 수 있습니다(요청 바디의 placeId로 대상 업장 지정).
    // 사장님 본인은 placeId를 보내도 무시하고 항상 본인 업장으로만 신청됩니다.
    const isOwner = profile?.owner_status === "verified" && !!profile?.owner_place_id;
    const adminPlaceId = !isOwner && profile?.is_admin && Number(body?.placeId) > 0 ? Number(body.placeId) : null;
    if (!isOwner && adminPlaceId == null) {
      return NextResponse.json({ error: "인증된 사장님 계정이 아니거나 연결된 업장이 없습니다" }, { status: 403 });
    }
    const targetPlaceId = isOwner ? profile!.owner_place_id : adminPlaceId;
    if (adminPlaceId != null) {
      const { data: target } = await supabaseAdmin.from("places").select("id").eq("id", adminPlaceId).maybeSingle();
      if (!target) return NextResponse.json({ error: "장소를 찾을 수 없습니다" }, { status: 404 });
    }

    // 이미 처리 대기 중인 신청이 있으면 중복 신청을 막습니다.
    const { data: existingPending } = await supabaseAdmin
      .from("premium_requests")
      .select("id")
      .eq("place_id", targetPlaceId)
      .eq("status", "pending")
      .maybeSingle();
    if (existingPending) {
      return NextResponse.json({ error: "이미 처리 대기 중인 신청이 있습니다" }, { status: 409 });
    }

    const months = Number(body?.months) > 0 ? Math.min(Math.floor(Number(body.months)), 12) : 1;
    const payerName = typeof body?.payerName === "string" ? body.payerName.slice(0, 40) : null;
    const rawMemo = typeof body?.memo === "string" ? body.memo.slice(0, 480) : "";
    // 관리자가 대신 신청한 건은 기록에 남깁니다.
    const memo = adminPlaceId != null ? `[관리자 대리 신청] ${rawMemo}`.trim() : rawMemo || null;

    const { error } = await supabaseAdmin.from("premium_requests").insert([
      {
        place_id: targetPlaceId,
        owner_auth_user_id: user.id,
        plan: "basic",
        months,
        payer_name: payerName,
        memo,
        status: "pending",
      },
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 지금까지 승인된 개월 수를 이어서 할인 구간(첫 달 무료·2~3개월째 반값)을 계산합니다.
    const { data: approved } = await supabaseAdmin.from("premium_requests").select("months").eq("place_id", targetPlaceId).eq("status", "approved");
    const usedMonths = (approved || []).reduce((sum, r) => sum + (Number(r.months) || 0), 0);
    const price = quote(months, usedMonths);
    await notifyAdmin({
      title: price.total === 0 ? "💎 프리미엄 신청 — 무료 기간(입금 없음)" : "💎 프리미엄 신청 — 입금 확인 필요",
      lines: [`업장 번호 ${targetPlaceId}`, `${months}개월(이용 ${usedMonths}개월 뒤)`, `받을 금액 ${won(price.total)}`, payerName ? `입금자명 ${payerName}` : null],
      path: "/admin/premium",
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/owner/apply-premium] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
