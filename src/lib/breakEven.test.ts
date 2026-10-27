import { describe, it, expect } from "vitest";
import { averageRevenuePerShop, breakEven, netOf, scenarioRows } from "./breakEven";

const prices = { premium: 19_800, store: 33_000, local: 55_000 };

describe("손익분기 계산", () => {
  it("요금제 비율로 가게 1곳의 평균 요금을 낸다", () => {
    expect(averageRevenuePerShop(prices, { premium: 100, store: 0, local: 0 })).toBe(19_800);
    expect(averageRevenuePerShop(prices, { premium: 50, store: 50, local: 0 })).toBe(26_400);
    expect(averageRevenuePerShop(prices, { premium: 0, store: 0, local: 0 })).toBe(0);
  });
  it("수수료를 뺀 실수령액", () => {
    expect(netOf(10_000, 3)).toBe(9_700);
    expect(netOf(10_000, 150)).toBe(0);
  });
  it("운영비를 메우는 데 필요한 유료 가게 수(올림)", () => {
    const r = breakEven([{ id: "a", label: "운영비", monthly: 100_000 }], prices, { premium: 100, store: 0, local: 0 }, 0);
    expect(r.monthlyCost).toBe(100_000);
    expect(r.shopsNeeded).toBe(6); // 19,800 × 5 = 99,000 < 100,000
    expect(r.revenueNeeded).toBe(118_800);
  });
  it("그 밖의 매출이 있으면 그만큼 덜 필요하다", () => {
    expect(breakEven([{ id: "a", label: "운영비", monthly: 100_000 }], prices, { premium: 100, store: 0, local: 0 }, 0, 60_000).shopsNeeded).toBe(3);
  });
  it("가게당 남는 돈이 없으면 계산하지 않는다", () => {
    expect(breakEven([{ id: "a", label: "운영비", monthly: 100_000 }], prices, { premium: 0, store: 0, local: 0 }, 0).shopsNeeded).toBe(null);
  });
  it("가게 수별 월 이익", () => {
    const r = breakEven([{ id: "a", label: "운영비", monthly: 100_000 }], prices, { premium: 100, store: 0, local: 0 }, 0);
    expect(scenarioRows([5, 10], r)).toEqual([{ shops: 5, revenue: 99_000, profit: -1_000 }, { shops: 10, revenue: 198_000, profit: 98_000 }]);
  });
});
