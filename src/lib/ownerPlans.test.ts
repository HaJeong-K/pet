import { describe, it, expect } from "vitest";
import { priceForMonth, quote, PREMIUM_MONTHLY_PRICE } from "./ownerPlans";

describe("사장님 프리미엄 요금(단계 인상 프로모션)", () => {
  it("첫 달은 무료, 2~3개월째는 반값, 4개월째부터 정가", () => {
    expect(priceForMonth(1)).toBe(0);
    expect(priceForMonth(2)).toBe(9900);
    expect(priceForMonth(3)).toBe(9900);
    expect(priceForMonth(4)).toBe(PREMIUM_MONTHLY_PRICE);
    expect(priceForMonth(12)).toBe(PREMIUM_MONTHLY_PRICE);
  });

  it("처음 3개월 신청하면 0 + 9,900 + 9,900원", () => {
    const q = quote(3);
    expect(q.perMonth).toEqual([0, 9900, 9900]);
    expect(q.total).toBe(19800);
    expect(q.listTotal).toBe(PREMIUM_MONTHLY_PRICE * 3);
  });

  it("이미 3개월 쓴 뒤 연장하면 정가", () => {
    expect(quote(2, 3).perMonth).toEqual([PREMIUM_MONTHLY_PRICE, PREMIUM_MONTHLY_PRICE]);
  });

  it("1개월 쓴 뒤 2개월 연장하면 할인 구간이 이어진다", () => {
    expect(quote(2, 1).perMonth).toEqual([9900, 9900]);
  });
});
