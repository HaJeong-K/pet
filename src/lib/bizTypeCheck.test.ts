import { describe, it, expect } from "vitest";
import { editDistance, nameCandidates, namesLookSame, typeCandidates, typeFitsKind } from "./bizTypeCheck";

describe("편집 거리", () => {
  it("바꾸거나 넣거나 뺀 글자 수를 센다", () => {
    expect(editDistance("숙박업", "숙박업")).toBe(0);
    expect(editDistance("숙밥업", "숙박업")).toBe(1);
    expect(editDistance("커피전문", "커피전문점")).toBe(1);
  });
});

describe("국세청에 물어볼 종목 후보", () => {
  it("입력 그대로와 띄어쓰기를 뺀 것을 먼저 넣는다", () => {
    expect(typeCandidates("커피 전문점").slice(0, 2)).toEqual(["커피 전문점", "커피전문점"]);
  });
  it("한두 글자 오타는 표준 종목명으로 바로잡은 후보를 더한다", () => {
    expect(typeCandidates("숙밥업")).toContain("숙박업");
    expect(typeCandidates("휴계음식점")).toContain("휴게음식점");
    expect(typeCandidates("일반및생활숙박시설운영업")).toContain("일반 및 생활 숙박시설 운영업");
  });
  it("전혀 다른 종목을 숙박으로 바꾸지 않는다", () => {
    const c = typeCandidates("건설업");
    expect(c).not.toContain("숙박업");
    expect(c).toEqual(["건설업"]);
  });
  it("빈 입력이면 후보 없음", () => {
    expect(typeCandidates("  ")).toEqual([]);
  });
});

describe("국세청에 물어볼 상호 후보", () => {
  it("띄어쓰기와 법인 표기 차이를 후보로 만든다", () => {
    expect(nameCandidates("멍멍 카페")).toEqual(["멍멍 카페", "멍멍카페"]);
    expect(nameCandidates("(주)해피펫")).toEqual(expect.arrayContaining(["(주)해피펫", "주식회사 해피펫", "해피펫"]));
  });
});

describe("종목이 사장님 유형에 맞는지", () => {
  it("숙소는 숙박·민박·펜션·야영 종목만", () => {
    expect(typeFitsKind("lodging", "일반 및 생활 숙박시설 운영업")).toBe(true);
    expect(typeFitsKind("lodging", "농어촌민박업")).toBe(true);
    expect(typeFitsKind("lodging", "야영장 운영업")).toBe(true);
    expect(typeFitsKind("lodging", "종합 건설업")).toBe(false);
    expect(typeFitsKind("lodging", "커피전문점")).toBe(false);
    expect(typeFitsKind("lodging", "애견호텔")).toBe(false);
  });
  it("가게는 음식·카페·용품·반려동물 서비스 종목", () => {
    expect(typeFitsKind("store", "커피전문점")).toBe(true);
    expect(typeFitsKind("store", "애완동물 및 관련용품 소매업")).toBe(true);
    expect(typeFitsKind("store", "동물병원")).toBe(true);
    expect(typeFitsKind("store", "종합 건설업")).toBe(false);
    expect(typeFitsKind("store", "소프트웨어 개발 및 공급업")).toBe(false);
  });
});

describe("가게 이름 비교(오타 허용)", () => {
  it("포함 관계·법인 표기·한두 글자 오타는 같은 곳", () => {
    expect(namesLookSame("(주)멍멍카페", "멍멍 카페 경북대점")).toBe(true);
    expect(namesLookSame("포레스트펜션", "포레스투펜션")).toBe(true);
  });
  it("전혀 다른 이름은 다른 곳", () => {
    expect(namesLookSame("멍멍카페", "냥냥식당")).toBe(false);
    expect(namesLookSame("포레스트펜션", "바다캠핑장")).toBe(false);
  });
});
