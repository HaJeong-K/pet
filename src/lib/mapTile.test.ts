import { describe, expect, it } from "vitest";
import { compactPlace, DEFAULT_CENTER, expandPlace, snapToTile, tileQuery, TILE_RADIUS_KM } from "./mapTile";
import { distanceKm } from "./nearestGrid";

describe("지도 칸 단위 요청", () => {
  it("같은 동네의 서로 다른 좌표는 같은 주소가 된다(캐시 공유)", () => {
    expect(tileQuery(35.871432, 128.601455)).toBe(tileQuery(35.8899, 128.6312));
    expect(tileQuery(35.871432, 128.601455)).toBe("lat=35.9&lng=128.6&radiusKm=30");
  });

  it("위치를 모르면 기준점(서울시청) 칸으로 요청한다 — 전국 데이터를 받지 않는다", () => {
    expect(tileQuery()).toBe(tileQuery(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng));
    expect(tileQuery(null, null)).toBe(tileQuery(NaN, NaN));
    expect(tileQuery()).toContain("lat=");
  });

  it("칸 가운데는 실제 위치에서 8km 넘게 떨어지지 않는다 → 내 위치 기준 22km 이상을 항상 받는다", () => {
    let worst = 0;
    for (let lat = 33.1; lat <= 38.6; lat += 0.0137) {
      for (let lng = 125.0; lng <= 131.0; lng += 0.0291) {
        const tile = snapToTile(lat, lng);
        worst = Math.max(worst, distanceKm(lat, lng, tile.lat, tile.lng));
      }
    }
    expect(worst).toBeLessThan(8);
    expect(TILE_RADIUS_KM - worst).toBeGreaterThan(22);
  });
});

describe("가벼운 장소(전송량 줄이기)", () => {
  const full = {
    id: 3000000123, sourceId: "culture-123", name: "멍멍카페", category: "카페", address: "대구 중구 동성로 1", lat: "35.8690000000001", lng: "128.5940000000002",
    pet_zone: "both", hours: null, large_dog: true, treatable_animals: null, phone: "053-000-0000", memo: "긴 안내문", website: null, closed_days: null,
    parking: null, entry_fee: null, image_url: "/images/default-place.png", created_at: null, source: "public-data",
  };

  it("줄였다가 되돌리면 지도·목록이 쓰는 값은 그대로다", () => {
    const back = expandPlace(compactPlace(full));
    for (const key of ["id", "name", "category", "address", "pet_zone", "hours", "large_dog", "treatable_animals", "phone", "website", "closed_days", "parking", "entry_fee", "image_url", "created_at", "source"] as const) {
      expect(back[key], key).toEqual(full[key]);
    }
    expect(Number(back.lat)).toBeCloseTo(35.869, 6);
    expect(Number(back.lng)).toBeCloseTo(128.594, 6);
  });

  it("빈 값·기본 그림·안내문·출처 번호는 보내지 않는다", () => {
    const small = compactPlace(full);
    expect(Object.keys(small).sort()).toEqual(["address", "category", "id", "large_dog", "lat", "lng", "name", "pet_zone", "phone"]);
    expect(JSON.stringify(small).length).toBeLessThan(JSON.stringify(full).length * 0.55);
  });

  it("false 값(대형견 불가)은 빈 값으로 취급하지 않고 보낸다", () => {
    expect(expandPlace(compactPlace({ ...full, large_dog: false })).large_dog).toBe(false);
  });
});
