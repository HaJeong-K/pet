import { describe, expect, it } from "vitest";
import { cleanSearchTags, matchesTalk } from "./talkSearch";

const store = ["뽀얌", "대구광역시 북구 대현남로", "반려동물용품", "수제간식", "멍푸치노"];

describe("말하듯이 검색", () => {
  it("지역과 분류를 섞어 적어도 찾는다", () => {
    expect(matchesTalk("대구 수제간식", store)).toBe(true);
    expect(matchesTalk("대구 수제 간식", store)).toBe(true);
    expect(matchesTalk("대구에 있는 수제간식 추천", store)).toBe(true);
  });
  it("해시태그가 없어도 메뉴 이름으로 찾는다", () => {
    expect(matchesTalk("멍푸치노", store)).toBe(true);
  });
  it("지역이 다르면 찾지 않는다", () => {
    expect(matchesTalk("부산 수제간식", store)).toBe(false);
  });
  it("숙소 해시태그", () => {
    expect(matchesTalk("대구 독채", ["스테이원향", "대구광역시 중구", "펜션", "독채", "한옥"])).toBe(true);
    expect(matchesTalk("대구 호텔", ["스테이원향", "대구광역시 중구", "펜션", "독채", "한옥"])).toBe(false);
  });
});

describe("해시태그 다듬기", () => {
  it("#과 띄어쓰기를 빼고 5개까지만 남긴다", () => {
    expect(cleanSearchTags(["#수제 간식", "화식", "화식", "#a", "b", "c", "d"])).toEqual(["수제간식", "화식", "a", "b", "c"]);
  });
  it("쉼표로 적어도 받는다", () => {
    expect(cleanSearchTags("독채, #한옥")).toEqual(["독채", "한옥"]);
  });
});
