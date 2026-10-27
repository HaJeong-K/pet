// src/lib/breakEven.ts
//
// 손익분기 계산(관리자 "사업성" 화면 · 사업계획서용) — 심사 의견 "개발 비용 대비 최소 매출액 계산이 필요"에 대한 답.
// 핵심 재원인 사장님 요금제(src/lib/ownerPlans.ts)를 기준으로, 매달 드는 비용을 메우려면 유료 가게가 몇 곳 필요한지 계산합니다.
// 글자·숫자만 다루는 함수라 테스트하기 쉽습니다(breakEven.test.ts).

export type CostItem = { id: string; label: string; monthly: number; note?: string };
export type PlanMix = { premium: number; store: number; local: number }; // 유료 가게 중 요금제별 비율(%)

/** 기본 운영비(월, 원) — 화면에서 바꿀 수 있는 출발값. 환율 1,400원 기준 대략값이며 실제 청구서로 고쳐 쓰세요. */
export const DEFAULT_COSTS: CostItem[] = [
  { id: "hosting", label: "서버(Vercel Pro)", monthly: 28_000, note: "월 $20" },
  { id: "db", label: "DB·저장소(Supabase Pro)", monthly: 35_000, note: "월 $25부터" },
  { id: "domain", label: "도메인", monthly: 2_000, note: "연 2만 원대 ÷ 12" },
  { id: "ai", label: "AI 사용료(제보 검증 등)", monthly: 30_000, note: "사용량에 따라" },
  { id: "marketing", label: "마케팅", monthly: 300_000, note: "블로그·SNS 운영" },
  { id: "misc", label: "기타(문자·알림·세무 등)", monthly: 50_000 },
  { id: "labor", label: "대표 인건비", monthly: 0, note: "0이면 운영비만 따짐" },
];

export const DEFAULT_MIX: PlanMix = { premium: 60, store: 30, local: 10 };

/** 유료 가게 1곳이 내는 평균 월 요금(요금제 비율로 가중 평균, 비율 합이 100이 아니어도 비율대로 나눔) */
export function averageRevenuePerShop(prices: { premium: number; store: number; local: number }, mix: PlanMix): number {
  const total = mix.premium + mix.store + mix.local;
  if (total <= 0) return 0;
  return (prices.premium * mix.premium + prices.store * mix.store + prices.local * mix.local) / total;
}

/** 결제 수수료 등으로 매출에서 빠지는 비율(%)을 뺀 실제로 남는 금액 */
export const netOf = (revenue: number, feePercent: number) => revenue * (1 - Math.min(Math.max(feePercent, 0), 100) / 100);

export type BreakEven = {
  monthlyCost: number;
  arpu: number;
  netArpu: number;
  /** 손익분기에 필요한 유료 가게 수(올림). 가게당 남는 돈이 없으면 null */
  shopsNeeded: number | null;
  /** 손익분기 월 매출 */
  revenueNeeded: number | null;
};

export function breakEven(costs: CostItem[], prices: { premium: number; store: number; local: number }, mix: PlanMix, feePercent: number, otherMonthlyRevenue = 0): BreakEven {
  const monthlyCost = costs.reduce((sum, c) => sum + Math.max(0, c.monthly || 0), 0);
  const arpu = averageRevenuePerShop(prices, mix);
  const netArpu = netOf(arpu, feePercent);
  const gap = Math.max(0, monthlyCost - Math.max(0, otherMonthlyRevenue));
  if (netArpu <= 0) return { monthlyCost, arpu, netArpu, shopsNeeded: null, revenueNeeded: null };
  const shopsNeeded = Math.ceil(gap / netArpu);
  return { monthlyCost, arpu, netArpu, shopsNeeded, revenueNeeded: shopsNeeded * arpu };
}

/** 가게 수별 월 매출·이익 표 */
export function scenarioRows(shopCounts: number[], result: BreakEven, otherMonthlyRevenue = 0) {
  return shopCounts.map((shops) => {
    const revenue = shops * result.arpu + otherMonthlyRevenue;
    const net = shops * result.netArpu + otherMonthlyRevenue;
    return { shops, revenue, profit: net - result.monthlyCost };
  });
}
