import { describe, expect, it } from "vitest";
import { isTourShopCategory, tourShopCategory } from "./tourShopCategory";

describe("tourShopCategory", () => {
  it("이름으로 분류를 다시 붙인다", () => {
    expect(tourShopCategory("성수약국")).toBe("약국");
    expect(tourShopCategory("올리브영 성수역점")).toBe("화장품");
    expect(tourShopCategory("LG전자 베스트샵 강남본점")).toBe("가전 매장");
    expect(tourShopCategory("이마트 왕십리점")).toBe("마트");
    expect(tourShopCategory("다비치안경 성수점")).toBe("안경원");
    expect(tourShopCategory("노스페이스 롯데몰 수원점")).toBe("의류·잡화");
    expect(tourShopCategory("신세계사이먼 파주 프리미엄 아울렛")).toBe("쇼핑몰 매장");
  });

  it("반려동물 관련 가게와 동물약국은 기존 분류로", () => {
    expect(tourShopCategory("펫프렌즈 스토어")).toBe("반려동물용품");
    expect(tourShopCategory("행복한동물약국")).toBe("동물약국");
  });

  it("모르는 이름은 쇼핑", () => {
    expect(tourShopCategory("정관장 성수점")).toBe("쇼핑");
    expect(tourShopCategory("")).toBe("쇼핑");
  });

  it("쇼핑으로 묶어 다루는 분류", () => {
    expect(isTourShopCategory("화장품")).toBe(true);
    expect(isTourShopCategory("쇼핑")).toBe(true);
    expect(isTourShopCategory("카페")).toBe(false);
    expect(isTourShopCategory("반려동물용품")).toBe(false);
  });
});
