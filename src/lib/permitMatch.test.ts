import { describe, expect, it } from "vitest";
import { cleanPhone, nameScore, permitKindsFor, pickPermit } from "@/lib/permitMatch";

describe("permitMatch", () => {
  it("분류로 찾아볼 인허가 업종", () => {
    expect(permitKindsFor("동물병원")).toEqual(["hospital"]);
    expect(permitKindsFor("휴게음식점", "멍멍 애견카페")[0]).toBe("exhibition");
    expect(permitKindsFor("반려동물용품")).toEqual([]);
  });
  it("이름 비교 — 같거나 꼬리말만 다르면 같은 가게", () => {
    expect(nameScore("행복동물병원", "행복 동물병원")).toBe(3);
    expect(nameScore("행복동물병원", "행복")).toBe(2);
    expect(nameScore("스타벅스 강남역점", "스타벅스강남역")).toBe(2);
    expect(nameScore("우리동네마트", "우리약국")).toBe(0);
    expect(nameScore("김밥천국", "엄마손칼국수")).toBe(0);
  });
  it("전화번호 정리", () => {
    expect(cleanPhone("0212345678")).toBe("02-1234-5678");
    expect(cleanPhone("053 123 4567")).toBe("053-123-4567");
    expect(cleanPhone("15880000")).toBe("1588-0000");
    expect(cleanPhone("")).toBeNull();
  });
  it("확실할 때만 고른다", () => {
    expect(pickPermit("행복동물병원", [{ BPLC_NM: "행복동물병원", SALS_STTS_CD: "01", TELNO: "0531234567" }])).toEqual({ name: "행복동물병원", phone: "053-123-4567", status: "open", closedOn: null });
    // 같은 건물에 이름이 안 맞는 가게만 있으면 고르지 않음
    expect(pickPermit("행복동물병원", [{ BPLC_NM: "튼튼약국", SALS_STTS_CD: "01", TELNO: "0531234567" }])).toBeNull();
    // 같은 이름 후보 둘이 번호가 다르면 고르지 않음
    expect(pickPermit("카페온", [{ BPLC_NM: "카페온", SALS_STTS_CD: "01", TELNO: "0531111111" }, { BPLC_NM: "카페온", SALS_STTS_CD: "01", TELNO: "0532222222" }])).toBeNull();
    // 폐업 기록과 영업 중 기록이 함께 있으면 영업 중
    expect(pickPermit("카페온", [{ BPLC_NM: "카페온", SALS_STTS_CD: "03", CLSBIZ_YMD: "2024-01-01" }, { BPLC_NM: "카페온", SALS_STTS_CD: "01", TELNO: "0531111111" }])?.status).toBe("open");
    expect(pickPermit("카페온", [{ BPLC_NM: "카페온", SALS_STTS_CD: "03", CLSBIZ_YMD: "2024-01-01" }])).toMatchObject({ status: "closed", closedOn: "2024-01-01" });
    // 이름으로만 찾을 때는 완전히 같은 이름만
    expect(pickPermit("행복동물병원", [{ BPLC_NM: "행복", SALS_STTS_CD: "01" }], 3)).toBeNull();
  });
});
