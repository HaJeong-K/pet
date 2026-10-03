import { describe, it, expect } from "vitest";
import { isParkPlaceId, parkPlaceId, parkIdOf, parkToPlace, PARK_ID_BASE } from "./parkPlace";

describe("공원 장소 번호", () => {
  it("공원 번호와 장소 번호를 서로 바꾼다", () => {
    expect(parkPlaceId(123)).toBe(PARK_ID_BASE + 123);
    expect(parkIdOf(parkPlaceId("123"))).toBe(123);
  });

  it("일반 장소·공공데이터 장소 번호는 공원으로 보지 않는다", () => {
    expect(isParkPlaceId(42)).toBe(false);
    expect(isParkPlaceId(3046738939)).toBe(false);
    expect(isParkPlaceId(8_294_967_295)).toBe(false); // 공공데이터 번호 상한(40억 + 2^32)
    expect(isParkPlaceId("9000010321")).toBe(true);
    expect(isParkPlaceId("park-1")).toBe(false);
  });

  it("공원을 장소 상세가 읽는 모양으로 바꾼다", () => {
    const place = parkToPlace({ id: 7, name: "해운대공원", lat: "35.1", lng: "129.1", category: "근린공원", area: "1000", managementAgency: "구청", facilityNote: "운동시설: 철봉" });
    expect(place).toMatchObject({ id: PARK_ID_BASE + 7, category: "공원", park_category: "근린공원", park_agency: "구청", is_park: true });
  });
});
