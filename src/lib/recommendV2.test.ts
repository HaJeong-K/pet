import { describe, it, expect } from "vitest";
import {
  calculateRecommendBreakdownV2,
  popularityBonusV2,
  qualityAdjustment,
  fatiguePenalty,
  rerankForDiversity,
  buildUserPreferenceProfile,
  personalMatch,
  categoryKey,
  pickDistinctReasons,
  type RecommendV2Input,
} from "./recommend";
import { assignRecVariant, hashToBucket } from "./experiment";

const base: RecommendV2Input = { distanceKm: 1, matchesSelectedFilter: false };

describe("calculateRecommendBreakdownV2", () => {
  it("항상 0~100 사이 점수를 반환한다", () => {
    const cases: RecommendV2Input[] = [
      base,
      { ...base, distanceKm: 9999, affinityScore: 0, isDisliked: true, impressionCount: 99 },
      { ...base, distanceKm: 0, matchesSelectedFilter: true, largeDog: true, bookmarksDecayed: 9999, likesDecayed: 9999, affinityScore: 100, personalMatch: 1 },
    ];
    for (const c of cases) {
      const { total } = calculateRecommendBreakdownV2(c);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });

  it("친화도(리뷰 평판)가 높을수록 순위가 오르고, 낮으면 내려간다", () => {
    const good = calculateRecommendBreakdownV2({ ...base, affinityScore: 90 });
    const neutral = calculateRecommendBreakdownV2({ ...base, affinityScore: null });
    const bad = calculateRecommendBreakdownV2({ ...base, affinityScore: 20 });
    expect(good.raw).toBeGreaterThan(neutral.raw);
    expect(bad.raw).toBeLessThan(neutral.raw);
  });

  it("싫어요한 장소·이미 찜한 장소·반복 노출된 장소는 감점된다", () => {
    const plain = calculateRecommendBreakdownV2(base).raw;
    expect(calculateRecommendBreakdownV2({ ...base, isDisliked: true }).raw).toBeLessThan(plain);
    expect(calculateRecommendBreakdownV2({ ...base, isBookmarked: true }).raw).toBeLessThan(plain);
    expect(calculateRecommendBreakdownV2({ ...base, impressionCount: 10 }).raw).toBeLessThan(plain);
  });

  it("프리미엄 여부는 v2 정렬 점수에 영향을 주지 않는다(광고 슬롯으로 분리)", () => {
    const input = { ...base, isPremium: true } as RecommendV2Input & { isPremium: boolean };
    expect(calculateRecommendBreakdownV2(input).raw).toBe(calculateRecommendBreakdownV2(base).raw);
  });
});

describe("popularityBonusV2", () => {
  it("반응이 늘수록 커지지만 상한(15)에 수렴한다", () => {
    expect(popularityBonusV2(0, 0)).toBe(0);
    const few = popularityBonusV2(2, 2);
    const many = popularityBonusV2(50, 50);
    expect(many).toBeGreaterThan(few);
    expect(popularityBonusV2(1e6, 1e6)).toBeLessThanOrEqual(15);
  });
});

describe("qualityAdjustment / fatiguePenalty", () => {
  it("친화도 기준점(65)에서는 0, 데이터가 없으면 0", () => {
    expect(qualityAdjustment(65)).toBe(0);
    expect(qualityAdjustment(null)).toBe(0);
  });

  it("노출 3회까지는 감점이 없고, 이후 상한(8)까지 증가한다", () => {
    expect(fatiguePenalty(3)).toBe(0);
    expect(fatiguePenalty(4)).toBeGreaterThan(0);
    expect(fatiguePenalty(1000)).toBe(8);
  });
});

describe("rerankForDiversity", () => {
  it("점수가 비슷하면 같은 카테고리만 연달아 뽑지 않는다", () => {
    const candidates = [
      { place: "cafe1", score: 90, category: "카페" },
      { place: "cafe2", score: 89, category: "카페" },
      { place: "cafe3", score: 88, category: "카페" },
      { place: "park1", score: 86, category: "공원" },
    ];
    const picked = rerankForDiversity(candidates, 3).map((c) => c.place);
    expect(picked[0]).toBe("cafe1");
    expect(picked).toContain("park1");
  });

  it("점수 차이가 크면 다양성보다 점수를 우선한다", () => {
    const candidates = [
      { place: "cafe1", score: 90, category: "카페" },
      { place: "cafe2", score: 88, category: "카페" },
      { place: "park1", score: 40, category: "공원" },
    ];
    const picked = rerankForDiversity(candidates, 2).map((c) => c.place);
    expect(picked).toEqual(["cafe1", "cafe2"]);
  });
});

describe("개인화 취향 프로필", () => {
  const places: Record<string, { category: string; pet_zone: string }> = {
    "1": { category: "카페", pet_zone: "both" },
    "2": { category: "카페", pet_zone: "indoor" },
    "3": { category: "공원", pet_zone: "both" },
  };

  it("찜/좋아요한 카테고리와 같은 장소일수록 일치도가 높다", () => {
    const profile = buildUserPreferenceProfile(
      [
        { place_id: 1, type: "bookmark" },
        { place_id: 2, type: "like" },
      ],
      (id) => places[id]
    );
    expect(personalMatch(profile, { category: "카페", pet_zone: "both" })).toBeGreaterThan(
      personalMatch(profile, { category: "공원", pet_zone: "indoor" })
    );
    expect(profile.bookmarked.has("1")).toBe(true);
  });

  it("반응이 너무 적으면(1개) 개인화 가점을 주지 않는다", () => {
    const profile = buildUserPreferenceProfile([{ place_id: 1, type: "bookmark" }], (id) => places[id]);
    expect(personalMatch(profile, { category: "카페" })).toBe(0);
  });

  it("싫어요한 장소는 disliked로 분리되고 취향 추정에서 빠진다", () => {
    const profile = buildUserPreferenceProfile(
      [
        { place_id: 3, type: "dislike" },
        { place_id: 3, type: "like" },
      ],
      (id) => places[id]
    );
    expect(profile.disliked.has("3")).toBe(true);
    expect(profile.signalCount).toBe(0);
  });

  it("categoryKey는 괄호 표기 차이를 흡수한다", () => {
    expect(categoryKey("동물병원(24시)")).toBe("동물병원");
    expect(categoryKey(null)).toBe("기타");
  });
});

describe("A/B 버킷 배정", () => {
  it("같은 사용자는 항상 같은 그룹에 배정된다", () => {
    expect(assignRecVariant("user-abc", 50)).toBe(assignRecVariant("user-abc", 50));
  });

  it("롤아웃 0%면 전원 v1, 100%면 전원 v2", () => {
    expect(assignRecVariant("user-abc", 0)).toBe("v1");
    expect(assignRecVariant("user-abc", 100)).toBe("v2");
  });

  it("버킷이 0~99에 고르게 분포한다", () => {
    let v2 = 0;
    for (let i = 0; i < 2000; i++) if (hashToBucket(`u${i}`) < 50) v2++;
    expect(v2).toBeGreaterThan(850);
    expect(v2).toBeLessThan(1150);
  });
});

describe("pickDistinctReasons", () => {
  it("목록 대부분에 공통인 이유는 건너뛰고 항목별 다음 이유를 고른다", () => {
    const lists = [
      ["대형견 동반 가능", "바로 근처예요"],
      ["대형견 동반 가능"],
      ["대형견 동반 가능", "찜이 많아요"],
      ["대형견 동반 가능"],
      ["새로 등록됐어요"],
    ];
    expect(pickDistinctReasons(lists)).toEqual(["바로 근처예요", null, "찜이 많아요", null, "새로 등록됐어요"]);
  });
});
