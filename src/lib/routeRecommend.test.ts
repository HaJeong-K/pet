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
    const route = buildRoute(many, CENTER, "walk", 4)!;
    const ids = route.stops.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(route.stops.filter((s) => s.role === "vet").length).toBeLessThanOrEqual(1);
    expect(route.stops.filter((s) => s.role === "pharmacy").length).toBeLessThanOrEqual(1);
  });

  it("역할이 맞아도 걸어갈 수 없을 만큼 먼 장소(20km)는 코스에 넣지 않는다", () => {
    const near: RoutablePlace[] = [
      { id: 60, name: "근처 공원", lat: CENTER.lat + 0.003, lng: CENTER.lng, category: "공원" },
      { id: 61, name: "근처 약국", lat: CENTER.lat, lng: CENTER.lng + 0.003, category: "동물약국" },
      { id: 62, name: "먼 카페", lat: CENTER.lat + 0.18, lng: CENTER.lng, category: "카페" },
    ];
    const route = buildRoute(near, CENTER, "walk", 4)!;
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

  it("모든 정거장의 친화도는 0~100 사이다", () => {
    const route = buildRoute(candidates, CENTER, "attraction", 4);
    for (const stop of route?.stops ?? []) {
      expect(stop.friendliness).toBeGreaterThanOrEqual(0);
      expect(stop.friendliness).toBeLessThanOrEqual(100);
    }
  });
});
