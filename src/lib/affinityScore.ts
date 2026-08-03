// src/lib/affinityScore.ts
//
// 반려동물 친화도 점수 (0~100점) 산출 엔진 — Rule-based
//
// 신청서에 기술된 4대 가중치를 그대로 구현합니다.
//   - 리뷰 만족도            45%
//   - 정부 공공데이터 검증    25%
//   - 사용자 반응(찜/추천/비추천) 20%
//   - 편의시설 옵션          10%
//
// KoBERT 파인튜닝 감성분석 모델은 별도의 학습/서빙 인프라(GPU, 라벨링 데이터)가 필요해
// 이번 단계에서는 규칙 기반(Rule-based) 키워드 스코어링으로 우선 구현했습니다.
// reviewSatisfactionScore()만 모델 추론 결과로 교체하면 KoBERT 파이프라인으로
// 자연스럽게 승격되도록 인터페이스를 분리해 두었습니다.

export interface AffinityReviewInput {
  content: string;
  likes?: number;
}

export interface AffinityInput {
  reviews: AffinityReviewInput[];
  likesCount: number;
  dislikesCount: number;
  bookmarkCount: number;
  /** 행안부/식약처 등 공공데이터로 검증된 장소인지 (사용자 제보만 있는 장소는 false) */
  isPublicDataVerified: boolean;
  amenities: {
    largeDog?: boolean | null;
    petMenu?: string | null;
    petZone?: string | null; // "indoor" | "terrace" | "both"
  };
}

export interface AffinityBreakdown {
  reviewSatisfaction: number;
  governmentVerification: number;
  userReaction: number;
  amenity: number;
  total: number;
}

const POSITIVE_KEYWORDS = [
  "친절", "깨끗", "좋아요", "좋았", "최고", "만족", "넓어요", "넓고",
  "편해요", "편했", "안전", "친화적", "추천", "재방문", "쾌적", "배려",
];

const NEGATIVE_KEYWORDS = [
  "불친절", "더러", "최악", "불만", "좁아요", "좁고", "불편", "위험",
  "비추", "냄새", "시끄러", "짜증", "실망", "별로",
];

function reviewSatisfactionScore(reviews: AffinityReviewInput[]): number {
  if (!reviews || reviews.length === 0) return 60; // 리뷰가 없으면 중립값
  let pos = 0;
  let neg = 0;
  for (const r of reviews) {
    const text = r.content || "";
    pos += POSITIVE_KEYWORDS.filter((k) => text.includes(k)).length;
    neg += NEGATIVE_KEYWORDS.filter((k) => text.includes(k)).length;
  }
  const total = pos + neg;
  if (total === 0) return 65; // 키워드가 안 걸리는 중립 리뷰만 있는 경우
  const ratio = pos / total;
  return Math.round(ratio * 100);
}

function governmentVerificationScore(verified: boolean): number {
  return verified ? 100 : 40;
}

function userReactionScore(likes: number, dislikes: number, bookmarks: number): number {
  const votes = likes + dislikes;
  const voteScore = votes === 0 ? 60 : Math.round((likes / votes) * 100);
  const bookmarkBonus = Math.min(20, bookmarks * 2);
  return Math.min(100, Math.round(voteScore * 0.8 + bookmarkBonus));
}

function amenityScore(amenities: AffinityInput["amenities"]): number {
  let score = 0;
  if (amenities.largeDog) score += 34;
  if (amenities.petMenu && amenities.petMenu !== "정보없음") score += 33;
  if (amenities.petZone === "both") score += 33;
  else if (amenities.petZone) score += 20;
  return Math.min(100, score);
}

export function calculateAffinityBreakdown(input: AffinityInput): AffinityBreakdown {
  const reviewSatisfaction = reviewSatisfactionScore(input.reviews);
  const governmentVerification = governmentVerificationScore(input.isPublicDataVerified);
  const userReaction = userReactionScore(input.likesCount, input.dislikesCount, input.bookmarkCount);
  const amenity = amenityScore(input.amenities);

  const total = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        reviewSatisfaction * 0.45 +
          governmentVerification * 0.25 +
          userReaction * 0.2 +
          amenity * 0.1
      )
    )
  );

  return { reviewSatisfaction, governmentVerification, userReaction, amenity, total };
}

export function calculateAffinityScore(input: AffinityInput): number {
  return calculateAffinityBreakdown(input).total;
}

export type AffinityTier = "green" | "yellow" | "red";

export function getAffinityTier(score: number): AffinityTier {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export const AFFINITY_TIER_LABEL: Record<AffinityTier, string> = {
  green: "친화도 높음",
  yellow: "친화도 보통",
  red: "정보 확인 필요",
};

export const AFFINITY_TIER_COLOR: Record<AffinityTier, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

export const AFFINITY_TIER_BG: Record<AffinityTier, string> = {
  green: "#f0fdf4",
  yellow: "#fefce8",
  red: "#fef2f2",
};
