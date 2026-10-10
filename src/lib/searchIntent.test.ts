import { describe, expect, it } from "vitest";
import { describeIntent, looksLikeRegion, parseSearchIntent } from "./searchIntent";

describe("검색어 풀이(searchIntent)", () => {
  it("우리동네 핫플 / 새장소", () => {
    for (const q of ["우리동네 핫플", "우리 동네 핫플", "우리동네핫플", "내 주변 핫한 곳", "근처 인기 장소", "동네 HOT"]) {
      const r = parseSearchIntent(q);
      expect(r, q).toMatchObject({ structured: true, nearMe: true, badge: "hot", rest: "" });
    }
    for (const q of ["우리동네 새장소", "우리동네 새 장소", "우리동네새장소", "내주변 신규", "근처 새로 생긴 가게", "동네 new"]) {
      const r = parseSearchIntent(q);
      expect(r, q).toMatchObject({ structured: true, nearMe: true, badge: "new", rest: "" });
    }
  });

  it("우리동네 + 종류", () => {
    expect(parseSearchIntent("우리동네 카페")).toMatchObject({ nearMe: true, categoryLabel: "카페", categories: ["카페", "휴게음식점", "제과점영업"], rest: "" });
    expect(parseSearchIntent("근처 동물병원")).toMatchObject({ nearMe: true, categoryLabel: "동물병원", categories: ["동물병원"] });
    expect(parseSearchIntent("내 주변 약국")).toMatchObject({ nearMe: true, categories: ["동물약국"] });
    expect(parseSearchIntent("우리동네 공원")).toMatchObject({ nearMe: true, parks: true, categories: [] });
    expect(parseSearchIntent("우리동네 대형견 실내 카페")).toMatchObject({ nearMe: true, largeDog: true, zone: "indoor", categoryLabel: "카페" });
  });

  it("우리동네 + 가게 이름", () => {
    expect(parseSearchIntent("우리동네 스타벅스")).toMatchObject({ structured: true, nearMe: true, badge: null, rest: "스타벅스", restLooksRegion: false });
  });

  it("지역 이름 + 핫플·종류", () => {
    expect(parseSearchIntent("대구 삼덕동 핫플")).toMatchObject({ structured: true, nearMe: false, badge: "hot", rest: "대구 삼덕동", restLooksRegion: true });
    expect(parseSearchIntent("삼덕동핫플")).toMatchObject({ badge: "hot", rest: "삼덕동", restLooksRegion: true });
    expect(parseSearchIntent("대구카페")).toMatchObject({ categoryLabel: "카페", rest: "대구", restLooksRegion: true });
    expect(parseSearchIntent("수성구 새장소")).toMatchObject({ badge: "new", rest: "수성구", restLooksRegion: true });
    expect(parseSearchIntent("성수 핫플")).toMatchObject({ badge: "hot", rest: "성수", restLooksRegion: false });
    expect(parseSearchIntent("부산 해운대구 애견 동반 식당 추천")).toMatchObject({ categoryLabel: "식당", rest: "부산 해운대구", restLooksRegion: true });
  });

  it("아는 낱말이 없으면 예전 검색 방식(structured=false)", () => {
    for (const q of ["스타벅스", "대구 중구", "삼덕동", "올리브영 종로점", "", "   "]) {
      expect(parseSearchIntent(q).structured, q).toBe(false);
    }
  });

  it("내주변 · 내 주변 · 근처도 우리동네와 같은 뜻", () => {
    for (const near of ["내주변", "내 주변", "주변", "근처", "내 근처", "동네", "우리 동네", "집 근처"]) {
      expect(parseSearchIntent(near + " 핫플"), near).toMatchObject({ structured: true, nearMe: true, badge: "hot", rest: "" });
      expect(parseSearchIntent(near + " 새장소"), near).toMatchObject({ nearMe: true, badge: "new", rest: "" });
      expect(parseSearchIntent(near + " 카페"), near).toMatchObject({ nearMe: true, categoryLabel: "카페", rest: "" });
      expect(parseSearchIntent(near + " 올리브영"), near).toMatchObject({ nearMe: true, rest: "올리브영" });
    }
    expect(parseSearchIntent("내주변핫플")).toMatchObject({ nearMe: true, badge: "hot", rest: "" });
  });

  it("지역 이름 + 가게 이름", () => {
    expect(parseSearchIntent("대구 올리브영")).toMatchObject({ structured: true, nearMe: false, badge: null, rest: "대구 올리브영", restLooksRegion: false });
    expect(parseSearchIntent("수성구 스타벅스 범어점")).toMatchObject({ structured: true, rest: "수성구 스타벅스 범어점" });
    // 앞이 지역 이름이 아니면 예전 방식
    expect(parseSearchIntent("올리브영 대구").structured).toBe(false);
  });

  it("다른 말의 일부인 한 글자는 자르지 않는다", () => {
    expect(parseSearchIntent("핫도그").structured).toBe(false);
    expect(parseSearchIntent("새우").structured).toBe(false);
    expect(parseSearchIntent("새우 식당")).toMatchObject({ categoryLabel: "식당", rest: "새우", badge: null });
    // 한 글자라도 띄어 쓰면 인정
    expect(parseSearchIntent("우리동네 새 가게").badge).toBe("new");
  });

  it("지역 이름처럼 보이는지", () => {
    expect(looksLikeRegion("대구")).toBe(true);
    expect(looksLikeRegion("대구 삼덕동")).toBe(true);
    expect(looksLikeRegion("서울특별시 종로구")).toBe(true);
    expect(looksLikeRegion("스타벅스")).toBe(false);
    expect(looksLikeRegion("")).toBe(false);
  });

  it("화면 설명 한 줄", () => {
    expect(describeIntent(parseSearchIntent("우리동네 핫플"), null, null)).toBe("우리동네 · HOT");
    expect(describeIntent(parseSearchIntent("대구 삼덕동 카페"), "대구 삼덕동", null)).toBe("대구 삼덕동 · 카페");
    expect(describeIntent(parseSearchIntent("우리동네 스타벅스"), null, "스타벅스")).toBe('우리동네 · "스타벅스"');
  });
});
