import { describe, expect, it } from "vitest";
import { infoLines, infoText } from "./infoLines";

describe("infoLines", () => {
  it("띄어 쓴 빗금과 끝의 빗금은 줄바꿈", () => {
    expect(infoLines("매일 10:00~22:00 / 월요일 휴무")).toEqual(["매일 10:00~22:00", "월요일 휴무"]);
    expect(infoLines("월~금 09:30~18:30, 토 09:30~13:00/")).toEqual(["월~금 09:30~18:30", "토 09:30~13:00"]);
    expect(infoLines("체크인 15:00 / 체크아웃 11:00")).toEqual(["체크인 15:00", "체크아웃 11:00"]);
  });

  it("붙여 쓴 빗금과 낱말 사이 쉼표는 그대로", () => {
    expect(infoLines("월/수/금 휴무")).toEqual(["월/수/금 휴무"]);
    expect(infoLines("- 입실 : 캠핑장 12:00 / 글램핑장, 펜션 15:00")).toEqual(["- 입실 : 캠핑장 12:00", "글램핑장, 펜션 15:00"]);
  });

  it("붙어 온 '- 항목'과 '[구분]', '※'는 새 줄", () => {
    expect(infoLines("- 1월/11월~12월 09:00~17:30- 2월~4월/10월 09:00~18:00")).toEqual(["- 1월/11월~12월 09:00~17:30", "- 2월~4월/10월 09:00~18:00"]);
    expect(infoLines("[3월~4월]08:00~18:00 [5월~8월]08:00~19:00 ※ 입장 마감 1시간 전")).toEqual(["[3월~4월]08:00~18:00", "[5월~8월]08:00~19:00", "※ 입장 마감 1시간 전"]);
  });

  it("빈 값", () => {
    expect(infoLines(null)).toEqual([]);
    expect(infoText("매일 10:00~22:00 / 월요일 휴무")).toBe("매일 10:00~22:00\n월요일 휴무");
  });
});
