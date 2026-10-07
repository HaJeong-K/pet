import { describe, expect, it } from "vitest";
import { buildNearestGrid, distanceKm } from "./nearestGrid";

// 격자 색인의 결과가 "전부 훑는 방식"과 완전히 같은지 확인합니다(추천 점수가 바뀌면 안 되므로).

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}
const brute = (points: { lat: number; lng: number }[], lat: number, lng: number) => {
  let min = Infinity;
  for (const p of points) { const d = distanceKm(lat, lng, p.lat, p.lng); if (d < min) min = d; }
  return Number.isFinite(min) ? min : null;
};

describe("buildNearestGrid", () => {
  it("전부 훑은 결과와 같다(대구 주변 공원 1,500곳 × 장소 400곳)", () => {
    const rand = seeded(7);
    const parks = Array.from({ length: 1500 }, () => ({ lat: 35.6 + rand() * 0.55, lng: 128.3 + rand() * 0.65 }));
    const grid = buildNearestGrid(parks);
    for (let i = 0; i < 400; i++) {
      const lat = 35.5 + rand() * 0.8, lng = 128.2 + rand() * 0.9; // 일부는 공원 범위 밖
      expect(grid.nearestKm(lat, lng)).toBeCloseTo(brute(parks, lat, lng)!, 9);
    }
  });

  it("점이 드문드문 있어도 같다(멀리 떨어진 점 몇 개)", () => {
    const parks = [{ lat: 33.5, lng: 126.5 }, { lat: 37.57, lng: 126.98 }, { lat: 35.18, lng: 129.07 }];
    const grid = buildNearestGrid(parks);
    for (const [lat, lng] of [[35.87, 128.6], [37.5, 127.0], [33.4, 126.6], [38.2, 128.5]]) {
      expect(grid.nearestKm(lat, lng)).toBeCloseTo(brute(parks, lat, lng)!, 9);
    }
  });

  it("문자열 좌표를 받고, 잘못된 좌표는 건너뛴다", () => {
    const grid = buildNearestGrid([{ lat: "35.87", lng: "128.60" }, { lat: "", lng: "x" }]);
    expect(grid.size).toBe(1);
    expect(grid.nearestKm(35.87, 128.6)).toBeCloseTo(0, 9);
  });

  it("점이 없거나 좌표가 잘못되면 null", () => {
    expect(buildNearestGrid([]).nearestKm(35, 128)).toBeNull();
    expect(buildNearestGrid([{ lat: 35, lng: 128 }]).nearestKm(NaN, 128)).toBeNull();
  });
});
