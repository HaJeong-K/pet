import { describe, it, expect } from "vitest";
import { calculateRecommendBreakdown, calculateRecommendScore, type RecommendInput } from "./recommend";

const base: RecommendInput = {
  distanceKm: null,
  matchesSelectedFilter: false,
};

describe("calculateRecommendScore", () => {
  it("항상 0~100 사이 점수를 반환한다", () => {
    const cases: RecommendInput[] = [
      base,
      { ...base, distanceKm: 0 },
      { ...base, distanceKm: 9999 },
      { ...base, distanceKm: 5, matchesSelectedFilter: true, largeDog: true, isPremium: true, bookmarkCount: 9999, likeCount: 9999 },
      { ...base, distanceKm: -3 }, // 방어 로직: 음수 거리
    ];
    for (const input of cases) {
      const score = calculateRecommendScore(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("거리가 멀수록 점수가 낮아진다(다른 조건 동일)", () => {
    const near = calculateRecommendScore({ ...base, distanceKm: 0.5 });
    const far = calculateRecommendScore({ ...base, distanceKm: 20 });
    expect(near).toBeGreaterThan(far);
  });

  it("거리 정보가 없으면(null) 감점을 적용하지 않는다", () => {
    const breakdown = calculateRecommendBreakdown({ ...base, distanceKm: null });
    expect(breakdown.distancePenalty).toBe(0);
  });

  it("선택한 필터와 일치하면 가점을 받는다", () => {
    const withoutMatch = calculateRecommendScore({ ...base, distanceKm: 3 });
    const withMatch = calculateRecommendScore({ ...base, distanceKm: 3, matchesSelectedFilter: true });
    expect(withMatch).toBeGreaterThan(withoutMatch);
  });

  it("14일 이내 신규 등록 장소는 가점을 받고, 그 이후엔 받지 않는다", () => {
    const today = new Date().toISOString();
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const freshBreakdown = calculateRecommendBreakdown({ ...base, createdAt: today });
    const oldBreakdown = calculateRecommendBreakdown({ ...base, createdAt: oneYearAgo });

    expect(freshBreakdown.newPlaceBonus).toBeGreaterThan(0);
    expect(oldBreakdown.newPlaceBonus).toBe(0);
  });

  it("등록일을 알 수 없는 공공데이터 장소(createdAt 없음)는 신규 가점이 없다", () => {
    const breakdown = calculateRecommendBreakdown({ ...base, createdAt: null });
    expect(breakdown.newPlaceBonus).toBe(0);
  });

  it("미래 시각(잘못된 데이터)이 들어와도 신규 가점을 주지 않는다", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const breakdown = calculateRecommendBreakdown({ ...base, createdAt: future });
    expect(breakdown.newPlaceBonus).toBe(0);
  });

  it("찜/좋아요가 많을수록 인기도 가점이 커지되 상한(15점)을 넘지 않는다", () => {
    const none = calculateRecommendBreakdown({ ...base, bookmarkCount: 0, likeCount: 0 });
    const some = calculateRecommendBreakdown({ ...base, bookmarkCount: 5, likeCount: 5 });
    const huge = calculateRecommendBreakdown({ ...base, bookmarkCount: 100000, likeCount: 100000 });

    expect(none.popularityBonus).toBe(0);
    expect(some.popularityBonus).toBeGreaterThan(none.popularityBonus);
    expect(huge.popularityBonus).toBeGreaterThanOrEqual(some.popularityBonus);
    expect(huge.popularityBonus).toBeLessThanOrEqual(15);
  });

  it("프리미엄 장소는 동일 조건에서 더 높은 점수를 받는다", () => {
    const normal = calculateRecommendScore({ ...base, distanceKm: 3 });
    const premium = calculateRecommendScore({ ...base, distanceKm: 3, isPremium: true });
    expect(premium).toBeGreaterThan(normal);
  });

  it("가까운 공원이 있을수록 산책 가점이 커진다", () => {
    const noPark = calculateRecommendBreakdown({ ...base, distanceToNearestParkKm: null });
    const closePark = calculateRecommendBreakdown({ ...base, distanceToNearestParkKm: 0.1 });
    const farPark = calculateRecommendBreakdown({ ...base, distanceToNearestParkKm: 5 });

    expect(closePark.parkBonus).toBeGreaterThan(noPark.parkBonus);
    expect(farPark.parkBonus).toBe(0); // PARK_PROXIMITY_MAX_KM(1km) 밖
  });
});
