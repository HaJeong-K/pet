import { describe, it, expect } from "vitest";
import { isValidBizNo, parseBizInfoFromOcr, formatBizNo, isValidOpenDate, bizNamesMatch } from "./ownerBizInfo";

describe("사업자등록번호 검증 공식", () => {
  it("실제 존재하는 번호 형식은 통과한다", () => {
    expect(isValidBizNo("124-81-00998")).toBe(true); // 공개된 대기업 사업자번호
    expect(isValidBizNo("1248100998")).toBe(true);
  });
  it("한 자리만 틀려도 걸러낸다", () => {
    expect(isValidBizNo("1248100997")).toBe(false);
    expect(isValidBizNo("12481009")).toBe(false);
  });
  it("보기 좋게 하이픈을 넣는다", () => {
    expect(formatBizNo("1248100998")).toBe("124-81-00998");
    expect(formatBizNo("12481")).toBe("124-81");
  });
});

describe("사업자등록증 OCR 글자 해석", () => {
  const ocr = `사 업 자 등 록 증
(일반과세자)
등록번호 : 124-81-00998
상 호 : 멍멍카페
성 명 : 홍 길 동    생 년 월 일 : 1985 년 03 월 02 일
개 업 연 월 일 : 2020 년 03 월 15 일
사업장 소재지 : 대구광역시 북구 대학로 80
2024 년 01 월 10 일
북대구세무서장`;

  it("사업자번호·대표자명·개업일자를 뽑는다(생년월일·발급일과 헷갈리지 않음)", () => {
    expect(parseBizInfoFromOcr(ocr)).toEqual({ bizNo: "1248100998", ownerName: "홍길동", openDate: "20200315" });
  });

  it("못 읽은 값은 빈 문자열로 둔다", () => {
    expect(parseBizInfoFromOcr("흐릿한 사진")).toEqual({ bizNo: "", ownerName: "", openDate: "" });
  });

  it("미래 날짜는 개업일로 받지 않는다", () => {
    expect(isValidOpenDate("29991231")).toBe(false);
    expect(isValidOpenDate("20200230")).toBe(false);
  });
});

describe("가게 이름 비교", () => {
  it("법인 표기·공백 차이는 같은 곳으로 본다", () => {
    expect(bizNamesMatch("(주)멍멍카페", "멍멍 카페 경북대점")).toBe(true);
  });
  it("전혀 다른 이름은 다른 곳으로 본다", () => {
    expect(bizNamesMatch("멍멍카페", "냥냥식당")).toBe(false);
  });
});
