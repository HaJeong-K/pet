import { describe, it, expect } from "vitest";
import { findParkDuplicateIds, parkNameKey } from "./parkDuplicates";

describe("공원 데이터와 겹치는 장소 찾기", () => {
  const parks = [
    { id: 1, name: "가수원", lat: 36.3, lng: 127.35 },
    { id: 2, name: "구평 근린공원", lat: 35.08, lng: 128.98 },
    { id: 3, name: "중앙공원", lat: 37.5, lng: 127.0 },
  ];
  it("종류를 나타내는 말과 띄어쓰기는 떼고 이름을 비교한다", () => {
    expect(parkNameKey("가수원근린공원")).toBe("가수원");
    expect(parkNameKey("구평 근린공원")).toBe("구평");
    expect(parkNameKey("갯골생태공원(시흥)")).toBe("갯골");
    expect(parkNameKey("근린공원")).toBe("");
  });
  it("이름이 같고 가까우면 겹치는 것으로 본다", () => {
    const found = findParkDuplicateIds([
      { id: "a", name: "가수원근린공원", lat: 36.301, lng: 127.351 },
      { id: "b", name: "구평근린공원", lat: 35.08, lng: 128.98 },
    ], parks);
    expect([...found].sort()).toEqual(["a", "b"]);
  });
  it("이름이 같아도 멀리 있으면(다른 동네의 중앙공원) 남긴다", () => {
    expect(findParkDuplicateIds([{ id: "c", name: "중앙공원", lat: 35.1, lng: 129.0 }], parks).size).toBe(0);
  });
  it("공원 데이터에 없는 공원과 공원이 아닌 가게는 남긴다", () => {
    const found = findParkDuplicateIds([
      { id: "d", name: "두류공원", lat: 35.85, lng: 128.56 },
      { id: "e", name: "가수원 동물병원", lat: 36.3, lng: 127.35 },
    ], parks);
    expect(found.size).toBe(0);
  });
});
