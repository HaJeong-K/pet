import { describe, it, expect } from "vitest";
import { buildRoute, applyWalkingLegs, classifyStopRole, type RoutablePlace } from "./routeRecommend";

const CENTER = { lat: 37.5665, lng: 126.978 };

// 서울시청 인근에 흩어진 가상 장소들 — 실제 위경도 차이를 두어 거리 계산이 의미 있게 함
function place(overrides: Partial<RoutablePlace> & { id: number | string; name: string }): RoutablePlace {
  return {
    lat: CENTER.lat + Math.random() * 0.01,
    lng: CENTER.lng + Math.random() * 0.01,
    category: null,
    ...overrides,
  };
}

describe("classifyStopRole", () => {
  it("카테고리/이름에 동물병원이 포함되면 vet으로 분류한다", () => {
    expect(classifyStopRole({ id: 1, name: "행복동물병원", lat: 0, lng: 0, category: "동물병원(24시)" })).toBe("vet");
  });

  it("카테고리/이름에 동물약국이 포함되면 pharmacy로 분류한다", () => {
    expect(classifyStopRole({ id: 2, name: "튼튼동물약국", lat: 0, lng: 0 })).toBe("pharmacy");
  });
});

describe("buildRoute", () => {
  const candidates: RoutablePlace[] = [
    place({ id: 1, name: "산책 공원", category: "공원" }),
    place({ id: 2, name: "카페 A", category: "카페" }),
    place({ id: 3, name: "관광지 A", category: "관광지" }),
    place({ id: 4, name: "행복동물병원", category: "동물병원" }),
    place({ id: 5, name: "실내 놀이터", category: "실내" }),
  ];

  it("후보가 2개 미만이면 null을 반환한다", () => {
    expect(buildRoute([candidates[0]], CENTER, "walk")).toBeNull();
  });

  it("유효한 후보가 있으면 정거장이 있는 코스를 만든다", () => {
    const route = buildRoute(candidates, CENTER, "walk", 3);
    expect(route).not.toBeNull();
    expect(route!.stops.length).toBeGreaterThan(0);
    expect(route!.stops.length).toBeLessThanOrEqual(3);
  });

  it("좌표가 유효하지 않은(NaN) 후보는 제외한다", () => {
    const withInvalid: RoutablePlace[] = [
      ...candidates,
      { id: 99, name: "잘못된 좌표", lat: "abc", lng: "def" },
    ];
    const route = buildRoute(withInvalid, CENTER, "walk", 5);
    const ids = route?.stops.map((s) => s.place.id) ?? [];
    expect(ids).not.toContain(99);
  });

  it("excludeIds로 넘긴 장소는 코스에서 제외한다", () => {
    const route = buildRoute(candidates, CENTER, "walk", 5, { excludeIds: [1, 2, 3, 4, 5] });
    // 후보가 다 제외되면 pool.length < 2가 되어 null이거나, 남은 후보만으로 구성됨
    if (route) {
      for (const stop of route.stops) {
        expect([1, 2, 3, 4, 5]).not.toContain(stop.place.id);
      }
    } else {
      expect(route).toBeNull();
    }
  });

  it("도착 시각에 문을 닫는 장소는 코스에서 제외한다", () => {
    const monday10am = new Date(2026, 8, 21, 10, 0);
    const withClosed: RoutablePlace[] = [
      ...candidates,
      { id: 50, name: "월요휴무 카페", lat: CENTER.lat + 0.005, lng: CENTER.lng + 0.005, category: "카페", closed_days: "매주 월요일" },
      { id: 51, name: "야간 카페", lat: CENTER.lat + 0.004, lng: CENTER.lng + 0.004, category: "카페", hours: "20:00~23:00" },
    ];
    const route = buildRoute(withClosed, CENTER, "walk", 4, { startAt: monday10am });
    const ids = route?.stops.map((s) => s.place.id) ?? [];
    expect(ids).not.toContain(50);
    expect(ids).not.toContain(51);
  });

  it("같은 장소를 두 번 넣지 않고, 병원·약국은 최대 1개씩만 넣는다", () => {
    const many: RoutablePlace[] = [
      ...candidates,
      place({ id: 6, name: "튼튼동물병원", category: "동물병원" }),
      place({ id: 7, name: "행복동물약국", category: "동물약국" }),
      place({ id: 8, name: "새동물약국", category: "동물약국" }),
    ];
    const route = buildRoute(many, CENTER, "walk", 4, { includeVet: true, includePharmacy: true })!;
    const ids = route.stops.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(route.stops.filter((s) => s.role === "vet").length).toBeLessThanOrEqual(1);
    expect(route.stops.filter((s) => s.role === "pharmacy").length).toBeLessThanOrEqual(1);
  });

  describe("동물병원·약국 토글", () => {
    const pool: RoutablePlace[] = [
      { id: 70, name: "공원1", lat: CENTER.lat + 0.002, lng: CENTER.lng, category: "공원" },
      { id: 71, name: "카페1", lat: CENTER.lat, lng: CENTER.lng + 0.002, category: "카페" },
      { id: 72, name: "공원2", lat: CENTER.lat - 0.002, lng: CENTER.lng, category: "공원" },
      { id: 73, name: "카페2", lat: CENTER.lat, lng: CENTER.lng - 0.002, category: "카페" },
      { id: 74, name: "행복동물병원", lat: CENTER.lat + 0.003, lng: CENTER.lng + 0.003, category: "동물병원" },
      { id: 75, name: "튼튼동물약국", lat: CENTER.lat - 0.003, lng: CENTER.lng - 0.003, category: "동물약국" },
    ];
    const roles = (opts?: { includeVet?: boolean; includePharmacy?: boolean }) =>
      buildRoute(pool, CENTER, "walk", 4, opts)!.stops.map((s) => s.role);

    it("기본값(둘 다 끔)이면 병원·약국을 넣지 않는다", () => {
      expect(roles()).not.toContain("vet");
      expect(roles()).not.toContain("pharmacy");
    });

    it("켠 것만 1곳씩 넣는다", () => {
      expect(roles({ includeVet: true })).toContain("vet");
      expect(roles({ includeVet: true })).not.toContain("pharmacy");
      const both = roles({ includeVet: true, includePharmacy: true });
      expect(both.filter((r) => r === "vet")).toHaveLength(1);
      expect(both.filter((r) => r === "pharmacy")).toHaveLength(1);
    });
  });

  it("주소에 동 이름이 없는(도로명주소) 장소도 가까우면 산책 코스에 넣는다", () => {
    const roadAddr: RoutablePlace[] = [
      { id: 80, name: "소공원", lat: CENTER.lat + 0.003, lng: CENTER.lng, category: "공원", address: "서울 중구 세종대로 110" },
      { id: 81, name: "카페", lat: CENTER.lat, lng: CENTER.lng + 0.003, category: "카페", address: "서울 중구 무교로 21" },
      { id: 82, name: "근린공원", lat: CENTER.lat - 0.004, lng: CENTER.lng, category: "공원", address: "서울 중구 을지로 30" },
    ];
    const route = buildRoute(roadAddr, CENTER, "walk", 4)!;
    expect(route.stops.map((s) => s.place.id).sort()).toEqual([80, 81, 82]);
  });

  it("같은 역할이면 2km 떨어진 곳보다 가까운 곳을 고른다", () => {
    const route = buildRoute(
      [
        { id: 90, name: "공원", lat: CENTER.lat + 0.002, lng: CENTER.lng, category: "공원" },
        { id: 91, name: "가까운 카페", lat: CENTER.lat + 0.003, lng: CENTER.lng, category: "카페" },
        { id: 92, name: "먼 카페", lat: CENTER.lat + 0.0135, lng: CENTER.lng, category: "카페" },
      ],
      CENTER,
      "walk",
      2
    )!;
    const ids = route.stops.map((s) => s.place.id);
    expect(ids).toContain(91);
    expect(ids).not.toContain(92);
  });

  it("기본 반경에 장소가 모자라면 넓힌 반경으로 다시 만든다", () => {
    // 직선 2km(추정 도보 2.6km) — 산책 기본 반경 2km 밖, 넓힌 반경 3.5km 안
    const far: RoutablePlace[] = [
      { id: 100, name: "공원", lat: CENTER.lat + 0.018, lng: CENTER.lng, category: "공원" },
      { id: 101, name: "카페", lat: CENTER.lat + 0.018, lng: CENTER.lng + 0.002, category: "카페" },
    ];
    expect(buildRoute(far, CENTER, "walk", 4)?.stops.length).toBe(2);
  });

  it("실내 추천에는 공원·테라스 전용 장소를 넣지 않는다", () => {
    const mixed: RoutablePlace[] = [
      { id: 110, name: "공원", lat: CENTER.lat + 0.002, lng: CENTER.lng, category: "공원" },
      { id: 111, name: "테라스 카페", lat: CENTER.lat + 0.001, lng: CENTER.lng, category: "카페", pet_zone: "terrace" },
      { id: 112, name: "실내 카페", lat: CENTER.lat, lng: CENTER.lng + 0.002, category: "카페", pet_zone: "indoor" },
      { id: 113, name: "미술관", lat: CENTER.lat - 0.002, lng: CENTER.lng, category: "문화시설" },
    ];
    const ids = buildRoute(mixed, CENTER, "indoor", 4)!.stops.map((s) => s.place.id);
    expect(ids).not.toContain(110);
    expect(ids).not.toContain(111);
    expect(ids).toEqual(expect.arrayContaining([112, 113]));
  });

  it("역할이 맞아도 걸어갈 수 없을 만큼 먼 장소(20km)는 코스에 넣지 않는다", () => {
    const near: RoutablePlace[] = [
      { id: 60, name: "근처 공원", lat: CENTER.lat + 0.003, lng: CENTER.lng, category: "공원" },
      { id: 61, name: "근처 약국", lat: CENTER.lat, lng: CENTER.lng + 0.003, category: "동물약국" },
      { id: 62, name: "먼 카페", lat: CENTER.lat + 0.18, lng: CENTER.lng, category: "카페" },
    ];
    const route = buildRoute(near, CENTER, "walk", 4, { includePharmacy: true })!;
    const ids = route.stops.map((s) => s.place.id);
    expect(ids).not.toContain(62);
    for (const stop of route.stops) {
      if (stop.distanceToNextKm != null) expect(stop.distanceToNextKm).toBeLessThan(6);
    }
  });

  it("affinityScore가 주어지면 정거장 친화도로 그대로 쓴다(상세페이지와 동일 점수)", () => {
    const withAffinity = candidates.map((c) => ({ ...c, affinityScore: 77 }));
    const route = buildRoute(withAffinity, CENTER, "walk", 3)!;
    for (const stop of route.stops) expect(stop.friendliness).toBe(77);
  });

  it("applyWalkingLegs는 실제 도보 거리로 총 거리·시간을 바꾸고, 구간 수가 안 맞으면 그대로 둔다", () => {
    const route = buildRoute(candidates, CENTER, "walk", 3)!;
    const n = route.stops.length;
    const legsKm = Array(n).fill(1);
    const legsMin = Array(n).fill(15);
    const applied = applyWalkingLegs(route, legsKm, legsMin);
    expect(applied.totalDistanceKm).toBe(n);
    expect(applied.distanceSource).toBe("tmap");
    expect(applyWalkingLegs(route, [1], [15])).toBe(route);
  });

  describe("관광 중심 필수 정거장", () => {
    const at = (dLat: number, dLng: number) => ({ lat: CENTER.lat + dLat, lng: CENTER.lng + dLng });
    const base: RoutablePlace[] = [
      { id: 200, name: "동네 전시관", ...at(0.002, 0), category: "문화시설" },
      { id: 201, name: "관광공사 선정 전망대", ...at(0.015, 0), category: "관광지", sourceId: "tour-123" },
      { id: 202, name: "조용한 카페", ...at(0.0155, 0.001), category: "카페" },
      { id: 203, name: "후기 많은 카페", ...at(0.016, 0.002), category: "카페", reviewCount: 8, reviewScore: 90 },
      { id: 204, name: "공원", ...at(0.014, 0.001), category: "공원" },
    ];

    it("근방에 관광지가 없으면 코스를 만들지 않는다", () => {
      const noAttraction = base.filter((p) => p.id !== 200 && p.id !== 201);
      expect(buildRoute(noAttraction, CENTER, "attraction", 4)).toBeNull();
    });

    it("가까운 일반 관광지보다 조금 먼 관광공사 선정지를 유명 관광지로 고른다", () => {
      const route = buildRoute(base, CENTER, "attraction", 4)!;
      expect(route.stops[0].place.id).toBe(201);
      expect(route.stops[0].highlight).toBe("famous");
    });

    it("후기가 핫한 곳을 반드시 넣고 'hot'으로 표시한다", () => {
      const route = buildRoute(base, CENTER, "attraction", 4)!;
      const hot = route.stops.find((s) => s.place.id === 203);
      expect(hot?.highlight).toBe("hot");
      expect(hot?.bullets[0]).toContain("후기 8개");
    });

    it("만족도가 낮은 곳은 후기가 많아도 핫플로 보지 않는다", () => {
      const lowScore = base.map((p) => (p.id === 203 ? { ...p, reviewScore: 30 } : p));
      const route = buildRoute(lowScore, CENTER, "attraction", 4)!;
      expect(route.stops.some((s) => s.highlight === "hot")).toBe(false);
      expect(route.stops.filter((s) => s.highlight === "pick")).toHaveLength(1);
    });

    it("후기 데이터가 없으면 대체 장소를 넣고 'pick'으로 표시한다", () => {
      const noReviews = base.map((p) => ({ ...p, reviewCount: 0, reviewScore: null }));
      const route = buildRoute(noReviews, CENTER, "attraction", 4)!;
      expect(route.stops.filter((s) => s.highlight === "famous")).toHaveLength(1);
      expect(route.stops.filter((s) => s.highlight === "pick")).toHaveLength(1);
    });
  });

  it("모든 정거장의 친화도는 0~100 사이다", () => {
    const route = buildRoute(candidates, CENTER, "attraction", 4);
    for (const stop of route?.stops ?? []) {
      expect(stop.friendliness).toBeGreaterThanOrEqual(0);
      expect(stop.friendliness).toBeLessThanOrEqual(100);
    }
  });
});
