// src/lib/ownerPlans.ts
//
// 사장님 광고 상품(프리미엄) 구성과 가격표.
// ⚠ 가격은 "시범 운영 제안가"입니다 — 실제 결제(PG) 연동 전이라 신청 후 계좌 입금·관리자 승인으로 진행하며,
//    운영자가 확정하기 전까지 화면에도 "시범 운영가"라고 표시합니다. 금액을 바꾸려면 이 파일만 고치면 됩니다.
//
// 요금 구조(단계 인상 프로모션): 첫 달 무료 → 2~3개월째 반값 → 4개월째부터 정가.
// 무료·할인 기간이 끝나기 전에 미리 알리고, 자동으로 결제하지 않습니다(연장은 매번 신청·동의).

/** 돈을 내는 요금제 단계 — 위 단계는 아래 단계의 혜택을 모두 포함합니다(프리미엄 < 프리미엄 스토어 < 동네 대표) */
export type PaidPlanId = "premium" | "store" | "local";

export type OwnerPlan = {
  id: "basic" | PaidPlanId;
  name: string;
  tagline: string;
  /** 정가(월, 부가세 포함). 0이면 무료 */
  monthlyPrice: number;
  features: string[];
};

/** 프리미엄 정가(월, 부가세 포함) */
export const PREMIUM_MONTHLY_PRICE = 19_800;
/** 프리미엄 스토어(상품·예약 포장) 정가 — 시범 운영 제안가 */
export const STORE_MONTHLY_PRICE = 33_000;
/** 동네 대표(배너 포함) 정가 — 시범 운영 제안가 */
export const LOCAL_MONTHLY_PRICE = 55_000;

export const OWNER_PLANS: OwnerPlan[] = [
  {
    id: "basic",
    name: "기본",
    tagline: "인증만 하면 계속 무료",
    monthlyPrice: 0,
    features: ["가게 정보 직접 관리", "고객 후기에 사장님 답글(인증 배지)", "우리 가게 통계(조회·찜·길찾기·전화)"],
  },
  {
    id: "premium",
    name: "프리미엄",
    tagline: "더 많은 보호자에게 먼저 보이게",
    monthlyPrice: PREMIUM_MONTHLY_PRICE,
    features: [
      "주변 장소 목록 맨 위 노출 + 프리미엄 배지",
      "AI 추천 코스에 정거장으로 포함",
      "월간 성과 보고서(노출·클릭·길찾기·코스 포함 횟수)",
      "기본 기능 전체 포함",
    ],
  },
  {
    id: "store",
    name: "프리미엄 스토어",
    tagline: "우리 가게 상품을 올리고 예약 포장을 받아요",
    monthlyPrice: STORE_MONTHLY_PRICE,
    features: [
      "상품 등록(사진·설명·가격·재료 등) — 쇼핑 탭과 가게 상세에 진열",
      "포장 주문 받기 — 손님이 쇼핑 탭에서 직접 주문",
      "주문 관리 화면(확정·준비 완료·이용 완료)",
      "건당 수수료 없음(월 요금만)",
      "프리미엄 혜택 전체 포함",
    ],
  },
  {
    id: "local",
    name: "동네 대표",
    tagline: "보호자 화면에 배너로 우리 가게를 알려요",
    monthlyPrice: LOCAL_MONTHLY_PRICE,
    features: [
      "커뮤니티·마이페이지 배너에 우리 가게 노출",
      "추천 장소 광고 칸 우선",
      "문구·사진·글꼴을 직접 골라 배너 만들기",
      "프리미엄 스토어 혜택 전체 포함",
    ],
  },
];

/** 요금제 단계별 정가(월, 부가세 포함) */
export const PLAN_MONTHLY_PRICE: Record<PaidPlanId, number> = {
  premium: PREMIUM_MONTHLY_PRICE,
  store: STORE_MONTHLY_PRICE,
  local: LOCAL_MONTHLY_PRICE,
};
export const PLAN_NAME: Record<PaidPlanId, string> = { premium: "프리미엄", store: "프리미엄 스토어", local: "동네 대표" };
const PLAN_RANK: Record<PaidPlanId, number> = { premium: 1, store: 2, local: 3 };

/** 저장된 값(예전의 'basic'·빈 값 포함)을 지금의 단계 이름으로 — 모르는 값은 가장 낮은 '프리미엄'으로 봅니다 */
export function normalizePlan(raw: unknown): PaidPlanId {
  return raw === "store" || raw === "local" ? raw : "premium";
}
/** 그 단계가 필요한 단계 이상인지(예: 상품·예약은 'store' 이상) */
export function planAtLeast(plan: PaidPlanId | null | undefined, needed: PaidPlanId): boolean {
  return !!plan && PLAN_RANK[plan] >= PLAN_RANK[needed];
}

/** 이용 개월 차(1부터)별 할인율 — 첫 달 무료, 2~3개월째 50%, 이후 정가 */
export const PROMO_STEPS: { fromMonth: number; toMonth: number | null; discount: number; label: string }[] = [
  { fromMonth: 1, toMonth: 1, discount: 1, label: "첫 달 무료" },
  { fromMonth: 2, toMonth: 3, discount: 0.5, label: "2~3개월째 50% 할인" },
  { fromMonth: 4, toMonth: null, discount: 0, label: "4개월째부터 정가" },
];

/** n번째 달(1부터)의 요금 */
export function priceForMonth(nth: number, monthlyPrice = PREMIUM_MONTHLY_PRICE): number {
  const step = PROMO_STEPS.find((s) => nth >= s.fromMonth && (s.toMonth == null || nth <= s.toMonth));
  const discount = step?.discount ?? 0;
  // 100원 단위로 내림(9,900원처럼 깔끔한 금액이 되도록)
  return Math.floor((monthlyPrice * (1 - discount)) / 100) * 100;
}

/** 이용 기간 1회(요금표의 "한 달")의 실제 길이 — 승인·연장 모두 30일 단위로 계산합니다 */
export const PERIOD_DAYS = 30;
/** 기간 표시 — 숙소 사장님은 "30일 / 90일", 가게 사장님은 "1개월 / 3개월" */
export const periodText = (months: number, lodging: boolean) => (lodging ? `${months * PERIOD_DAYS}일` : `${months}개월`);

/** 해지 방어 "시크릿 프라이스" — 해지하려는 사장님에게 1회만, 다음 30일 요금을 30% 깎아 줍니다(기능은 그대로) */
export const RETENTION_DISCOUNT_PERCENT = 30;
export const RETENTION_DISCOUNT_MONTHS = 1;

/** 관리자·해지 방어로 받은 추가 할인 — 신청하는 기간의 앞쪽 months개월에 percent%를 더 깎습니다 */
export type ExtraDiscount = { percent: number; months: number };

/**
 * 이미 이용한 개월 수(usedMonths) 뒤로 months개월을 신청할 때의 월별 금액과 합계.
 * 처음 신청이면 usedMonths = 0. extra가 있으면 단계 요금 위에 추가 할인을 얹습니다(100원 단위 내림).
 */
export function quote(months: number, usedMonths = 0, monthlyPrice = PREMIUM_MONTHLY_PRICE, extra?: ExtraDiscount | null): { perMonth: number[]; total: number; listTotal: number; discounted: number } {
  const percent = Math.min(Math.max(extra?.percent ?? 0, 0), 100);
  const extraMonths = percent > 0 ? Math.max(0, Math.floor(extra?.months ?? 0)) : 0;
  const perMonth = Array.from({ length: Math.max(0, months) }, (_, i) => {
    const step = priceForMonth(usedMonths + i + 1, monthlyPrice);
    return i < extraMonths ? Math.floor((step * (1 - percent / 100)) / 100) * 100 : step;
  });
  return { perMonth, total: perMonth.reduce((a, b) => a + b, 0), listTotal: monthlyPrice * Math.max(0, months), discounted: Math.min(extraMonths, Math.max(0, months)) };
}

export const won = (n: number) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

// ── 해지 환불 규칙 ──
// 결제일(관리자가 입금을 확인해 적용한 날)부터 3일 안에 해지하면 그 결제 금액 전액,
// 그 뒤에는 남은 날만큼 일할로 돌려드립니다(10원 미만 버림). 환불이 생기면 혜택은 해지한 날 바로 끝납니다.
export const FULL_REFUND_DAYS = 3;

export type RefundInput = {
  /** 마지막으로 결제(승인)된 금액 */
  paidAmount: number;
  /** 결제일(승인 시각) */
  paidAt: string;
  /** 그 결제로 이용하는 기간의 시작·끝(끝 = 지금의 만료일) */
  periodStart: string;
  periodEnd: string;
};
export type Refund = { amount: number; kind: "full" | "prorated" | "none"; usedDays: number; totalDays: number; remainingDays: number };

export function refundFor(input: RefundInput, now = Date.now()): Refund {
  const DAY = 86_400_000;
  const start = new Date(input.periodStart).getTime();
  const end = new Date(input.periodEnd).getTime();
  const totalDays = Math.max(1, Math.round((end - start) / DAY));
  const usedDays = Math.min(totalDays, Math.max(0, Math.ceil((now - start) / DAY)));
  const remainingDays = totalDays - usedDays;
  if (input.paidAmount <= 0 || end <= now) return { amount: 0, kind: "none", usedDays, totalDays, remainingDays };
  if (now - new Date(input.paidAt).getTime() <= FULL_REFUND_DAYS * DAY) return { amount: input.paidAmount, kind: "full", usedDays, totalDays, remainingDays };
  const amount = Math.floor((input.paidAmount * remainingDays) / totalDays / 10) * 10;
  return { amount, kind: amount > 0 ? "prorated" : "none", usedDays, totalDays, remainingDays };
}
