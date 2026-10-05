import { describe, it, expect } from "vitest";
import { limitKind, cleanText, extractPhone, extractIntroFields, largeDogFrom, petZoneFrom, tidyLines, petMemo, type TourDetail } from "./tourDetails";

describe("관광공사 상세 정보 가공", () => {
  it("문의처 글에서 첫 전화번호만 꺼낸다", () => {
    expect(extractPhone("순천시청 녹지과 061-749-4243\n순천시청 건설과 061-749-6725")).toBe("061-749-4243");
    expect(extractPhone("0507-1359-3262")).toBe("0507-1359-3262");
    expect(extractPhone("1588-1234")).toBe("1588-1234");
    expect(extractPhone("02.123.4567")).toBe("02-123-4567");
    expect(extractPhone("문의 없음")).toBeNull();
    expect(extractPhone("")).toBeNull();
  });

  it("태그를 벗기고 줄바꿈은 살린다", () => {
    expect(cleanText("월~금 09:00<br />토 10:00")).toBe("월~금 09:00\n토 10:00");
    expect(cleanText("   ")).toBeNull();
  });

  it("장소 종류별로 다른 필드 이름에서 영업시간·문의처를 찾는다", () => {
    expect(extractIntroFields("39", { opentimefood: "09:00 - 20:00", restdatefood: "수요일", infocenterfood: "0507-1" })).toMatchObject({ hours: "09:00 - 20:00", closedDays: "수요일", infoCenter: "0507-1" });
    expect(extractIntroFields("32", { checkintime: "16:00", checkouttime: "11:00" }).hours).toBe("체크인 16:00 / 체크아웃 11:00");
    expect(extractIntroFields("12", { usetime: "상시 개방", parking: "가능" })).toMatchObject({ hours: "상시 개방", parking: "가능" });
    expect(extractIntroFields("12", null).hours).toBeNull();
  });

  it("가능 동물 문구로 대형견 가능 여부를 추정한다", () => {
    expect(largeDogFrom("전 견종 동반 가능")).toBe(true);
    expect(largeDogFrom("맹견 제외 전 견종 동반 가능")).toBe(true);
    expect(largeDogFrom("7kg 이하 반려동물")).toBe(false);
    expect(largeDogFrom("중소형견 동반 가능")).toBe(false);
    expect(largeDogFrom("일부 견종 동반 가능")).toBeNull();
    expect(largeDogFrom(null)).toBeNull();
  });

  it("동반 유형은 확실할 때만 동반 범위로 바꾼다", () => {
    expect(petZoneFrom("전구역 동반가능")).toBe("both");
    expect(petZoneFrom("일부구역 동반가능")).toBeNull();
  });

  it("붙어서 오는 안내 문구를 항목별로 줄바꿈한다", () => {
    expect(tidyLines("- 섶다리는 5월 철거- 맹견의 경우, 입마개 착용 필수- 배변봉투 지참")).toBe("- 섶다리는 5월 철거\n- 맹견의 경우, 입마개 착용 필수\n- 배변봉투 지참");
    expect(tidyLines("[하절기]- 09:00~19:00[동절기]- 09:00~18:00※ 홈페이지 참조")).toBe("[하절기]- 09:00~19:00\n[동절기]- 09:00~18:00\n※ 홈페이지 참조");
    expect(tidyLines("10:30-22:30")).toBe("10:30-22:30");
  });

  it("반려동물 안내를 메모로 묶는다", () => {
    const d = { petType: "전구역 동반가능", petNeeds: "목줄 착용", petEtc: null } as TourDetail;
    expect(petMemo(d)).toBe("동반 범위: 전구역 동반가능\n준비물: 목줄 착용");
    expect(petMemo({ petType: null, petNeeds: null, petEtc: null } as TourDetail)).toBeNull();
  });

  it("초당 호출 제한과 하루 한도 초과를 구분한다", () => {
    expect(limitKind(429, '{"errMsg":"LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR"}')).toBe("second");
    expect(limitKind(429, '{"errMsg":"LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"}')).toBe("day");
    expect(limitKind(200, "<returnReasonCode>22</returnReasonCode>")).toBe("day");
    expect(limitKind(429, "")).toBe("second");
    expect(limitKind(200, '{"response":{"header":{"resultCode":"0000"}}}')).toBeNull();
  });
});
