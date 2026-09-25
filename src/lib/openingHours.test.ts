import { describe, it, expect } from "vitest";
import { getOpenStatus, isClosedDay } from "./openingHours";

// 2026-09-21은 월요일
const at = (hh: number, mm = 0, day = 21) => new Date(2026, 8, day, hh, mm);

describe("getOpenStatus", () => {
  it("단순 시간대 안/밖을 판정한다", () => {
    expect(getOpenStatus("09:00~18:00", null, at(10))).toBe("open");
    expect(getOpenStatus("09:00~18:00", null, at(20))).toBe("closed");
    expect(getOpenStatus("10:00 - 22:00", null, at(21, 59))).toBe("open");
  });

  it("자정을 넘기는 영업시간을 처리한다", () => {
    expect(getOpenStatus("18:00~02:00", null, at(23))).toBe("open");
    expect(getOpenStatus("18:00~02:00", null, at(1))).toBe("open");
    expect(getOpenStatus("18:00~02:00", null, at(12))).toBe("closed");
  });

  it("24시간 영업은 항상 open", () => {
    expect(getOpenStatus("24시간 운영", null, at(3))).toBe("open");
  });

  it("휴무일(오늘 요일)이면 closed", () => {
    expect(getOpenStatus("09:00~18:00", "매주 월요일", at(10))).toBe("closed");
    expect(getOpenStatus("매일 10:00~21:00 (월요일 휴무)", null, at(12))).toBe("closed");
    expect(getOpenStatus("09:00~18:00", "매주 화요일", at(10))).toBe("open");
  });

  it("정보가 없거나 형식을 알 수 없으면 unknown", () => {
    expect(getOpenStatus(null, null, at(10))).toBe("unknown");
    expect(getOpenStatus("정보없음", null, at(10))).toBe("unknown");
    expect(getOpenStatus("매장 문의", null, at(10))).toBe("unknown");
  });

  it("요일별로 시간이 다르면 시간대 밖이어도 단정하지 않는다", () => {
    expect(getOpenStatus("평일 09:00~18:00 / 주말 10:00~17:00", null, at(19))).toBe("unknown");
  });
});

describe("isClosedDay", () => {
  it("격주·N째 주 같은 조건부 휴무는 휴무로 단정하지 않는다", () => {
    expect(isClosedDay("격주 월요일", at(10))).toBe(false);
    expect(isClosedDay("첫째 월요일", at(10))).toBe(false);
  });

  it("연중무휴는 휴무가 아니다", () => {
    expect(isClosedDay("연중무휴", at(10))).toBe(false);
  });

  it("요일 글자만 나열한 형식도 인식한다", () => {
    expect(isClosedDay("월, 화", at(10))).toBe(true);
  });
});
