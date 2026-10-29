// src/lib/server/premiumRequest.ts
//
// 프리미엄(요금제) 신청 한 건을 만듭니다 — 사장님이 직접 신청할 때(/api/owner/apply-premium)와
// 자동 연장(src/lib/server/premiumRenew.ts)이 같이 씁니다.
// 결제대행(PG) 연동 전이라 상태는 pending으로만 만들고, 관리자가 입금을 확인한 뒤 승인합니다.

import { db } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";
import { quote, won, PLAN_MONTHLY_PRICE, PLAN_NAME, type PaidPlanId } from "@/lib/ownerPlans";

export type PremiumRequestInput = {
  placeId: number; ownerUserId: string; plan: PaidPlanId; months: number;
  payerName: string | null; memo: string | null;
  /** 자동 연장으로 만든 신청인지(관리자 알림 제목이 달라짐) */
  auto?: boolean;
};

export async function createPremiumRequest(input: PremiumRequestInput): Promise<{ ok: true; total: number } | { ok: false; error: string; status: number }> {
  const { placeId, ownerUserId, plan, months, payerName, memo } = input;
  // 이미 처리 대기 중인 신청이 있으면 중복 신청을 막습니다.
  const { data: existingPending } = await db.from("premium_requests").select("id").eq("place_id", placeId).eq("status", "pending").maybeSingle();
  if (existingPending) return { ok: false, error: "이미 처리 대기 중인 신청이 있습니다", status: 409 };

  // 지금까지 승인된 개월 수를 이어서 할인 구간(첫 달 무료·2~3개월째 반값)을 계산합니다.
  // 관리자 할인·해지 방어 시크릿 프라이스(premium_perks)가 남아 있으면 앞쪽 개월에 더 깎습니다(표가 없으면 할인 없음).
  const [{ data: approved }, { data: perk }] = await Promise.all([
    db.from("premium_requests").select("months").eq("place_id", placeId).eq("status", "approved"),
    db.from("premium_perks").select("discount_percent, discount_months").eq("place_id", placeId).maybeSingle(),
  ]);
  const usedMonths = (approved || []).reduce((sum, r) => sum + (Number(r.months) || 0), 0);
  const extra = perk && Number(perk.discount_percent) > 0 && Number(perk.discount_months) > 0 ? { percent: Number(perk.discount_percent), months: Number(perk.discount_months) } : null;
  const price = quote(months, usedMonths, PLAN_MONTHLY_PRICE[plan], extra);

  const row = { place_id: placeId, owner_auth_user_id: ownerUserId, plan, months, payer_name: payerName, memo, status: "pending" };
  // 할인율·금액도 남깁니다 — 금액은 해지할 때 환불 계산(결제 3일 이내 전액, 이후 일할)에 씁니다.
  let { error } = await db.from("premium_requests").insert([{ ...row, discount_percent: price.discounted > 0 ? extra!.percent : 0, amount: price.total }]);
  // 할인율·금액 칸(scripts/sql/premium-cancel.sql, premium-refund.sql) 실행 전이면 그 칸 없이 저장합니다
  if (error && /amount/.test(error.message)) ({ error } = await db.from("premium_requests").insert([{ ...row, discount_percent: price.discounted > 0 ? extra!.percent : 0 }]));
  if (error && /discount_percent/.test(error.message)) ({ error } = await db.from("premium_requests").insert([row]));
  if (error) return { ok: false, error: error.message, status: 500 };

  await notifyAdmin({
    title: input.auto
      ? (price.total === 0 ? "🔁 요금제 자동 연장 — 무료 기간(입금 없음)" : "🔁 요금제 자동 연장 — 입금 확인 필요")
      : (price.total === 0 ? "💎 프리미엄 신청 — 무료 기간(입금 없음)" : "💎 프리미엄 신청 — 입금 확인 필요"),
    lines: [`업장 번호 ${placeId}`, `요금제 ${PLAN_NAME[plan]}`, `${months}개월(이용 ${usedMonths}개월 뒤)`, `받을 금액 ${won(price.total)}`, price.discounted > 0 ? `추가 할인 ${extra!.percent}% · ${price.discounted}개월 적용` : null, payerName ? `입금자명 ${payerName}` : null],
    path: "/admin/premium",
  });
  return { ok: true, total: price.total };
}
