import { describe, expect, it } from "vitest";
import { districtOf, roadPart, serviceOrder, tm5174ToWgs84 } from "./permitCoords";

describe("인허가 데이터에서 좌표 찾기(permitCoords)", () => {
  it("인허가 좌표(EPSG:5174)를 위도·경도로 바꾼다", () => {
    // 스타벅스 경북도청중앙점(경북 안동시 풍천면) — 인허가 데이터의 실제 값
    const p = tm5174ToWgs84(333586.963070204, 342699.335488275)!;
    expect(p.lat).toBeCloseTo(36.5761, 3);
    expect(p.lng).toBeCloseTo(128.4933, 3);
    // 좌표계의 기준점(동경 127도 부근, 북위 38도)은 원점 (200000, 500000)
    const origin = tm5174ToWgs84(200000, 500000)!;
    expect(origin.lat).toBeCloseTo(38.0, 1);
    expect(origin.lng).toBeCloseTo(127.0, 1);
  });

  it("빈 값·우리나라 밖의 좌표는 받지 않는다", () => {
    expect(tm5174ToWgs84(NaN, 1)).toBeNull();
    expect(tm5174ToWgs84(0, 0)).toBeNull();
    expect(tm5174ToWgs84(9_000_000, 9_000_000)).toBeNull();
  });

  it("주소에서 도로명과 건물번호를 뽑는다", () => {
    expect(roadPart("경상북도 안동시 풍천면 수호로 59, 1층 (갈전리)")).toEqual({ road: "수호로", number: "59" });
    expect(roadPart("대구광역시 중구 동성로2길 12-3 (삼덕동1가)")).toEqual({ road: "동성로2길", number: "12-3" });
    expect(roadPart("경기도 수원시 팔달구 중앙로 12번길 5")).toEqual({ road: "중앙로 12번길", number: "5" });
    expect(roadPart("서울특별시 종로구 세종대로 175")).toEqual({ road: "세종대로", number: "175" });
    // 지번 주소는 도로명이 없다
    expect(roadPart("경상북도 안동시 풍천면 갈전리 1276")).toBeNull();
  });

  it("주소에서 시·군·구를 찾는다(구가 있으면 구)", () => {
    expect(districtOf("경상북도 안동시 풍천면 수호로 59")).toBe("안동시");
    expect(districtOf("대구광역시 수성구 달구벌대로 2450")).toBe("수성구");
    expect(districtOf("경기도 수원시 팔달구 중앙로 12번길 5")).toBe("팔달구");
    expect(districtOf("세종특별자치시 한누리대로 2130")).toBeNull();
  });

  it("업종에 맞는 서비스부터 찾는다", () => {
    expect(serviceOrder("일반음식점")[0]).toBe("general");
    expect(serviceOrder("휴게음식점")[0]).toBe("cafe");
    expect(serviceOrder("제과점영업")[0]).toBe("bakery");
    expect(serviceOrder("카페/식당")).toHaveLength(3);
  });
});
