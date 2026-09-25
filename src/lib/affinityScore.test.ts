import { describe, it, expect } from "vitest";
import { calculateAffinityScore, calculateAffinityBreakdown, getAffinityTier, type AffinityInput } from "./affinityScore";

const baseInput: AffinityInput = {
  reviews: [],
  likesCount: 0,
  dislikesCount: 0,
  bookmarkCount: 0,
  isPublicDataVerified: false,
  amenities: {},
};

describe("calculateAffinityScore", () => {
  it("항상 0~100 사이 점수를 반환한다", () => {
    const cases: AffinityInput[] = [
      baseInput,
      { ...baseInput, isPublicDataVerified: true, likesCount: 999, bookmarkCount: 999, amenities: { largeDog: true, petZone: "both", hours: "a", phone: "b", parking: "c", entryFee: "d", website: "e" } },
      { ...baseInput, dislikesCount: 999 },
    ];
    for (const input of cases) {
      const score = calculateAffinityScore(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("리뷰가 없으면 중립값(60점)을 반영한다", () => {
    const breakdown = calculateAffinityBreakdown(baseInput);
    expect(breakdown.reviewSatisfaction).toBe(60);
  });

  it("긍정 키워드가 많은 리뷰는 만족도 점수를 높인다", () => {
    const positive = calculateAffinityBreakdown({
      ...baseInput,
      reviews: [{ content: "정말 친절하고 깨끗하고 좋았어요, 다음에 또 올게요 최고" }],
    });
    const negative = calculateAffinityBreakdown({
      ...baseInput,
      reviews: [{ content: "너무 불친절하고 더럽고 최악이었어요 비추" }],
    });
    expect(positive.reviewSatisfaction).toBeGreaterThan(negative.reviewSatisfaction);
  });

  it("부정어(불친절)가 긍정 키워드(친절)로 잘못 집계되지 않는다", () => {
    // "불친절"은 "친절"을 부분 문자열로 포함하지만, 부정 키워드를 먼저 제거하고
    // 긍정 키워드를 세기 때문에 순수 부정 리뷰로 처리되어야 한다.
    const breakdown = calculateAffinityBreakdown({
      ...baseInput,
      reviews: [{ content: "직원이 불친절해요" }],
    });
    // 중립값(65)보다 낮아야 함(부정 신호만 있음)
    expect(breakdown.reviewSatisfaction).toBeLessThan(65);
  });

  it("좋아요가 많은 리뷰일수록 더 큰 가중치를 갖는다", () => {
    const lowWeight = calculateAffinityBreakdown({
      ...baseInput,
      reviews: [
        { content: "친절해요", likes: 0 },
        { content: "불친절해요", likes: 100 },
      ],
    });
    // 좋아요 100개짜리 부정 리뷰가 훨씬 크게 반영되어 만족도가 중립(65) 미만이어야 함
    expect(lowWeight.reviewSatisfaction).toBeLessThan(65);
  });

  it("감성분석 모델 점수(sentimentScore)가 있으면 키워드 매칭보다 그 값을 우선한다", () => {
    const breakdown = calculateAffinityBreakdown({
      ...baseInput,
      reviews: [{ content: "그저 그랬어요", sentimentScore: 90 }],
    });
    expect(breakdown.reviewSatisfaction).toBe(90);
  });

  it("공공데이터로 검증된 장소는 검증 점수가 더 높다", () => {
    const verified = calculateAffinityBreakdown({ ...baseInput, isPublicDataVerified: true });
    const unverified = calculateAffinityBreakdown({ ...baseInput, isPublicDataVerified: false });
    expect(verified.governmentVerification).toBeGreaterThan(unverified.governmentVerification);
  });

  it("좋아요/싫어요 투표가 없으면 중립값(60점)에 투표 비중(0.8)을 곱한 값을 반영한다", () => {
    // userReactionScore = round(NO_VOTES_NEUTRAL(60) * VOTE_RATIO_WEIGHT(0.8) + bookmarkBonus(0)) = 48
    const breakdown = calculateAffinityBreakdown(baseInput);
    expect(breakdown.userReaction).toBe(48);
  });

  it("찜(bookmark)이 많을수록 사용자 반응 점수가 높아지되 100점을 넘지 않는다", () => {
    const none = calculateAffinityBreakdown({ ...baseInput, bookmarkCount: 0 });
    const many = calculateAffinityBreakdown({ ...baseInput, bookmarkCount: 9999 });
    expect(many.userReaction).toBeGreaterThan(none.userReaction);
    expect(many.userReaction).toBeLessThanOrEqual(100);
  });

  it("대형견 동반 가능 + 실내외 모두 가능일수록 편의시설 점수가 높다", () => {
    const none = calculateAffinityBreakdown(baseInput);
    const full = calculateAffinityBreakdown({
      ...baseInput,
      amenities: { largeDog: true, petZone: "both" },
    });
    expect(full.amenity).toBeGreaterThan(none.amenity);
  });
});

describe("getAffinityTier", () => {
  it("점수 구간에 맞는 신호등 등급을 반환한다", () => {
    expect(getAffinityTier(80)).toBe("green");
    expect(getAffinityTier(60)).toBe("yellow");
    expect(getAffinityTier(30)).toBe("red");
  });
});
