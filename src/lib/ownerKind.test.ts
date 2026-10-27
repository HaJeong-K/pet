import { describe, expect, it } from "vitest";
import { OWNER_KINDS, isLodgingCategory, ownerKindInfo, ownerKindOf } from "./ownerKind";

describe("ownerKindOf", () => {
  it("숙소만 lodging, 나머지는 모두 가게", () => {
    expect(ownerKindOf("lodging")).toBe("lodging");
    expect(ownerKindOf("store")).toBe("store");
    expect(ownerKindOf(null)).toBe("store");
    expect(ownerKindOf(undefined)).toBe("store");
    expect(ownerKindOf("hotel")).toBe("store");
  });
});

describe("ownerKindInfo", () => {
  it("유형마다 입력칸 이름이 다르다", () => {
    expect(ownerKindInfo("store").nameLabel).toBe("가게명");
    expect(ownerKindInfo("lodging").nameLabel).toBe("숙소명");
    expect(ownerKindInfo(null).label).toBe("가게");
  });
  it("두 유형 모두 정의돼 있다", () => {
    expect(OWNER_KINDS.map((k) => k.id)).toEqual(["store", "lodging"]);
  });
});

describe("isLodgingCategory", () => {
  it("숙박 계열 분류를 알아본다", () => {
    for (const c of ["펜션", "숙박", "호텔", "캠핑장", "글램핑", "한옥스테이"]) expect(isLodgingCategory(c)).toBe(true);
    for (const c of ["카페", "일반음식점", "공원", "", null]) expect(isLodgingCategory(c)).toBe(false);
  });
});
