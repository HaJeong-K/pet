import { describe, it, expect } from "vitest";
import { priceForMonth, quote, refundFor, PREMIUM_MONTHLY_PRICE } from "./ownerPlans";

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

describe("해지 방어 시크릿 할인", () => {
  it("다음 1회(30일)만 30% 더 깎는다", () => {
    const q = quote(3, 3, PREMIUM_MONTHLY_PRICE, { percent: 30, months: 1 });
    expect(q.perMonth[0]).toBe(Math.floor((PREMIUM_MONTHLY_PRICE * 0.7) / 100) * 100);
    expect(q.perMonth[1]).toBe(PREMIUM_MONTHLY_PRICE);
    expect(q.discounted).toBe(1);
  });
  it("할인이 없으면 예전과 같다", () => {
    expect(quote(2, 0).perMonth).toEqual(quote(2, 0, PREMIUM_MONTHLY_PRICE, null).perMonth);
  });
});

describe("해지 환불", () => {
  const base = { paidAmount: 33000, paidAt: "2026-10-01T00:00:00Z", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z" };
  it("결제 후 3일 이내면 전액", () => {
    expect(refundFor(base, new Date("2026-10-03T12:00:00Z").getTime())).toMatchObject({ amount: 33000, kind: "full" });
  });
  it("3일이 지나면 남은 날만큼 일할(10원 미만 버림)", () => {
    const r = refundFor(base, new Date("2026-10-11T00:00:00Z").getTime());
    expect(r).toMatchObject({ kind: "prorated", usedDays: 10, remainingDays: 20, amount: 22000 });
  });
  it("무료 기간이거나 끝난 기간은 환불 없음", () => {
    expect(refundFor({ ...base, paidAmount: 0 }, new Date("2026-10-02T00:00:00Z").getTime()).kind).toBe("none");
    expect(refundFor(base, new Date("2026-11-02T00:00:00Z").getTime()).kind).toBe("none");
  });
});
