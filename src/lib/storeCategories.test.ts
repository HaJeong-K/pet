import { describe, expect, it } from "vitest";
import { isStoreEligibleCategory } from "./storeCategories";

describe("쇼핑 입점 대상 가게 종류", () => {
  it.each(["카페", "일반음식점", "휴게음식점", "식당", "베이커리", "반려동물 수제간식", "반려동물용품"])("%s 는 입점 대상", (c) => {
    expect(isStoreEligibleCategory(c)).toBe(true);
  });
  it.each(["공원", "동물병원", "동물약국", "미용", "펜션", "호텔", "쇼핑", "", null, undefined])("%s 는 입점 대상이 아니다", (c) => {
    expect(isStoreEligibleCategory(c)).toBe(false);
  });
});
