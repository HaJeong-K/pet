import { describe, expect, it } from "vitest";
import { cleanHomepage, permitExtraOf, pickPermit } from "./permitMatch";

describe("인허가 추가 정보", () => {
  it("업태·객실 수·인허가일·홈페이지를 뽑는다", () => {
    expect(permitExtraOf({ BZSTAT_SE_NM: "한식", LCPMT_YMD: "2015-03-02", HPG: "www.example.co.kr" })).toEqual({ t: "한식", o: "2015-03-02", h: "https://www.example.co.kr" });
    expect(permitExtraOf({ BZSTAT_SE_NM: "숙박업 기타", KSRM_CNT: "2", WSRM_CNT: "10", LCPMT_YMD: "20200115" })).toEqual({ r: 12, o: "2020-01-15" });
    expect(permitExtraOf({ GSRM_CNT: "5" })).toEqual({ r: 5 });
  });
  it("뜻이 없는 업태(기타·분류 이름 그대로)와 이상한 값은 넣지 않는다", () => {
    expect(permitExtraOf({ BZSTAT_SE_NM: "기타", SNTTN_BZSTAT_NM: "기타", KSRM_CNT: "0", WSRM_CNT: "0", LCPMT_YMD: "" })).toEqual({});
    expect(permitExtraOf({ BZSTAT_SE_NM: "제과점영업", LCPMT_YMD: "1900-01-01" })).toEqual({});
  });
  it("홈페이지는 주소 모양일 때만", () => {
    expect(cleanHomepage("http://a.com/x")).toBe("http://a.com/x");
    expect(cleanHomepage("없음")).toBeNull();
    expect(cleanHomepage("")).toBeNull();
  });
  it("가게를 고르면 추가 정보도 함께 돌려준다", () => {
    const found = pickPermit("행복식당", [{ BPLC_NM: "행복식당", SALS_STTS_CD: "01", TELNO: "053-123-4567", BZSTAT_SE_NM: "한식", LCPMT_YMD: "2010-05-05" }]);
    expect(found?.extra).toEqual({ t: "한식", o: "2010-05-05" });
  });
});
