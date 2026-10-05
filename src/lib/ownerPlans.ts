// src/lib/ownerPlans.ts
//
// 사장님 광고 상품(프리미엄) 구성과 가격표.
// ⚠ 가격은 "시범 운영 제안가"입니다 — 실제 결제(PG) 연동 전이라 신청 후 계좌 입금·관리자 승인으로 진행하며,
//    운영자가 확정하기 전까지 화면에도 "시범 운영가"라고 표시합니다. 금액을 바꾸려면 이 파일만 고치면 됩니다.
//
// 요금 구조(단계 인상 프로모션): 첫 달 무료 → 2~3개월째 반값 → 4개월째부터 정가.
// 무료·할인 기간이 끝나기 전에 미리 알리고, 자동으로 결제하지 않습니다(연장은 매번 신청·동의).

export type OwnerPlan = {
  id: "basic" | "premium";
  name: string;
  tagline: string;
  /** 정가(월, 부가세 포함). 0이면 무료 */
  monthlyPrice: number;
  features: string[];
};

/** 프리미엄 정가(월, 부가세 포함) */
export const PREMIUM_MONTHLY_PRICE = 19_800;

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
      "추천 장소 목록 상단 노출 + 프리미엄 배지",
      "AI 추천 코스에 우선 포함",
      "커뮤니티·마이페이지 옆 광고 영역 노출",
      "월간 성과 보고서(노출·클릭·길찾기·코스 포함 횟수)",
      "기본 기능 전체 포함",
    ],
  },
];

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

/**
 * 이미 이용한 개월 수(usedMonths) 뒤로 months개월을 신청할 때의 월별 금액과 합계.
 * 처음 신청이면 usedMonths = 0.
 */
export function quote(months: number, usedMonths = 0, monthlyPrice = PREMIUM_MONTHLY_PRICE): { perMonth: number[]; total: number; listTotal: number } {
  const perMonth = Array.from({ length: Math.max(0, months) }, (_, i) => priceForMonth(usedMonths + i + 1, monthlyPrice));
  return { perMonth, total: perMonth.reduce((a, b) => a + b, 0), listTotal: monthlyPrice * Math.max(0, months) };
}

export const won = (n: number) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
