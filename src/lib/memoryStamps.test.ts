import { describe, expect, it } from "vitest";
import { courseCompleted, maxUsableStamps, stampDiscount, stampInRange } from "./memoryStamps";

describe("추억 스탬프", () => {
  it("예약 금액의 10%까지만 쓴다", () => {
    expect(maxUsableStamps(100000, 500)).toBe(100);
    expect(maxUsableStamps(100000, 30)).toBe(30);
    expect(maxUsableStamps(0, 30)).toBe(0);
    expect(stampDiscount(100000, 500, 500)).toEqual({ used: 100, discount: 10000 });
    expect(stampDiscount(100000, 5, 3)).toEqual({ used: 3, discount: 300 });
  });
  it("잘못된 사용 수는 0으로 본다", () => {
    expect(stampDiscount(100000, -3, 10).used).toBe(0);
    expect(stampDiscount(100000, 1.5, 10).used).toBe(0);
  });
  it("거리는 300m + 오차(최대 100m)까지 인정", () => {
    expect(stampInRange(300, null)).toBe(true);
    expect(stampInRange(350, 80)).toBe(true);
    expect(stampInRange(450, 5000)).toBe(false);
    expect(stampInRange(301, 0)).toBe(false);
  });
  it("코스는 2곳 이상을 모두 다녀와야 완주", () => {
    expect(courseCompleted(["1", "2"], new Set(["1", "2", "3"]))).toBe(true);
    expect(courseCompleted(["1", "2"], new Set(["1"]))).toBe(false);
    expect(courseCompleted(["1"], new Set(["1"]))).toBe(false);
  });
});
