import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/server/notify";
import { quote, won, normalizePlan, PLAN_MONTHLY_PRICE, PLAN_NAME } from "@/lib/ownerPlans";

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

    // 신청하는 요금제 단계(모르는 값은 가장 낮은 '프리미엄')
    const plan = normalizePlan(body?.plan);
    const months = Number(body?.months) > 0 ? Math.min(Math.floor(Number(body.months)), 12) : 1;
    const payerName = typeof body?.payerName === "string" ? body.payerName.slice(0, 40) : null;
    const rawMemo = typeof body?.memo === "string" ? body.memo.slice(0, 480) : "";
    const memo = rawMemo || null;

    // 지금까지 승인된 개월 수를 이어서 할인 구간(첫 달 무료·2~3개월째 반값)을 계산합니다.
    // 관리자 할인·해지 방어 시크릿 프라이스(premium_perks)가 남아 있으면 앞쪽 개월에 더 깎습니다(표가 없으면 할인 없음).
    const [{ data: approved }, { data: perk }] = await Promise.all([
      supabaseAdmin.from("premium_requests").select("months").eq("place_id", targetPlaceId).eq("status", "approved"),
      supabaseAdmin.from("premium_perks").select("discount_percent, discount_months").eq("place_id", targetPlaceId).maybeSingle(),
    ]);
    const usedMonths = (approved || []).reduce((sum, r) => sum + (Number(r.months) || 0), 0);
    const extra = perk && Number(perk.discount_percent) > 0 && Number(perk.discount_months) > 0 ? { percent: Number(perk.discount_percent), months: Number(perk.discount_months) } : null;
    const price = quote(months, usedMonths, PLAN_MONTHLY_PRICE[plan], extra);

    const row = {
      place_id: targetPlaceId,
      owner_auth_user_id: user.id,
      plan, // 'premium' | 'store' | 'local'
      months,
      payer_name: payerName,
      memo,
      status: "pending",
    };
    let { error } = await supabaseAdmin.from("premium_requests").insert([{ ...row, discount_percent: price.discounted > 0 ? extra!.percent : 0 }]);
    // 할인율 칸(scripts/sql/premium-cancel.sql) 실행 전이면 할인율 없이 저장합니다
    if (error && /discount_percent/.test(error.message)) ({ error } = await supabaseAdmin.from("premium_requests").insert([row]));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notifyAdmin({
      title: price.total === 0 ? "💎 프리미엄 신청 — 무료 기간(입금 없음)" : "💎 프리미엄 신청 — 입금 확인 필요",
      lines: [`업장 번호 ${targetPlaceId}`, `요금제 ${PLAN_NAME[plan]}`, `${months}개월(이용 ${usedMonths}개월 뒤)`, `받을 금액 ${won(price.total)}`, price.discounted > 0 ? `추가 할인 ${extra!.percent}% · ${price.discounted}개월 적용` : null, payerName ? `입금자명 ${payerName}` : null],
      path: "/admin/premium",
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/owner/apply-premium] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
