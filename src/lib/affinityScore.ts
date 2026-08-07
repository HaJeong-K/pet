// src/lib/affinityScore.ts
//
// 반려동물 친화도 점수 (0~100점) 산출 엔진 — Rule-based
//
// 신청서에 기술된 4대 가중치를 그대로 구현합니다(가중치 값은 scoringConfig.ts 참고).
//   - 리뷰 만족도            45%
//   - 정부 공공데이터 검증    25%
//   - 사용자 반응(찜/추천/비추천) 20%
//   - 편의시설 옵션          10%
//
// KoBERT 파인튜닝 감성분석 모델은 별도의 학습/서빙 인프라(GPU, 라벨링 데이터)가 필요해
// 이번 단계에서는 규칙 기반(Rule-based) 키워드 스코어링으로 우선 구현했습니다.
// reviewSatisfactionScore()만 모델 추론 결과로 교체하면 KoBERT 파이프라인으로
// 자연스럽게 승격되도록 인터페이스를 분리해 두었습니다.
//
// ── 키워드 스코어링 설계 노트 (부정어 처리) ──────────────────────────
// 단순 부분 문자열(includes) 매칭만 쓰면 "불친절"이 "친절"을, "불편해요"가
// "편해요"를 부분 문자열로 포함하고 있어서 명백히 부정적인 리뷰에서 긍정 키워드가
// 함께 집계되는 문제가 있었습니다. 그래서 부정 키워드를 먼저 찾아 그 구간을
// 제거한 텍스트에서만 긍정 키워드를 세도록 했습니다(stripMatchedKeywords 참고).

import { AFFINITY_WEIGHTS, AFFINITY_SUBSCORES, AFFINITY_TIER_THRESHOLDS } from "@/lib/scoringConfig";
import { hasInfo } from "@/lib/placeConstants";

export interface AffinityReviewInput {
  content: string;
  /** 이 리뷰가 받은 좋아요 수. 많을수록 신뢰도가 높다고 보고 감성 점수에 더 큰 비중을 둡니다. */
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
    petZone?: string | null; // "indoor" | "terrace" | "both"
    /** 운영시간·전화번호·주차·입장료·홈페이지 — "정보 완성도" 계산에 쓰입니다(amenityScore 참고) */
    hours?: string | null;
    phone?: string | null;
    parking?: string | null;
    entryFee?: string | null;
    website?: string | null;
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

/** text에서 keywords에 있는 부분 문자열을 모두 제거(공백으로 치환)한 결과를 반환 */
function stripMatchedKeywords(text: string, keywords: string[]): string {
  return keywords.reduce((acc, k) => acc.split(k).join(" "), text);
}

/** 리뷰 좋아요 수 → 이 리뷰가 감성 점수에 반영되는 가중치(1~REVIEW_LIKE_WEIGHT_MAX) */
function reviewWeight(likes: number | undefined): number {
  const boost = Math.max(0, likes ?? 0) * AFFINITY_SUBSCORES.REVIEW_LIKE_WEIGHT_STEP;
  return Math.min(AFFINITY_SUBSCORES.REVIEW_LIKE_WEIGHT_MAX, 1 + boost);
}

function reviewSatisfactionScore(reviews: AffinityReviewInput[]): number {
  if (!reviews || reviews.length === 0) return AFFINITY_SUBSCORES.NO_REVIEW_NEUTRAL;

  let pos = 0;
  let neg = 0;
  for (const r of reviews) {
    const text = r.content || "";
    const weight = reviewWeight(r.likes);

    const negHits = NEGATIVE_KEYWORDS.filter((k) => text.includes(k));
    neg += negHits.length * weight;

    // 부정 키워드가 겹쳐 포함하는 긍정 키워드(불친절→친절, 불편해요→편해요 등)가
    // 중복 집계되지 않도록, 매칭된 부정 키워드 구간을 제거한 텍스트로 긍정을 센다.
    const textForPositive = stripMatchedKeywords(text, negHits);
    const posHits = POSITIVE_KEYWORDS.filter((k) => textForPositive.includes(k));
    pos += posHits.length * weight;
  }

  const total = pos + neg;
  if (total === 0) return AFFINITY_SUBSCORES.NEUTRAL_REVIEW_NO_SIGNAL;
  return Math.round((pos / total) * 100);
}

function governmentVerificationScore(verified: boolean): number {
  return verified ? AFFINITY_SUBSCORES.GOV_VERIFIED : AFFINITY_SUBSCORES.GOV_UNVERIFIED;
}

function userReactionScore(likes: number, dislikes: number, bookmarks: number): number {
  const votes = Math.max(0, likes) + Math.max(0, dislikes);
  const voteRatioScore = votes === 0 ? AFFINITY_SUBSCORES.NO_VOTES_NEUTRAL : (likes / votes) * 100;
  const bookmarkBonus = Math.min(
    AFFINITY_SUBSCORES.BOOKMARK_BONUS_MAX,
    Math.max(0, bookmarks) * AFFINITY_SUBSCORES.BOOKMARK_BONUS_PER
  );
  return Math.min(100, Math.round(voteRatioScore * AFFINITY_SUBSCORES.VOTE_RATIO_WEIGHT + bookmarkBonus));
}

// "정보 완성도" 계산에 쓰는 필드 목록. 이 5개는 소스(공공데이터 3종 + 사용자 제보)마다
// 채워지는 정도는 다르지만, 펫 메뉴처럼 특정 소스만 원천적으로 0건인 필드는 아닙니다.
const INFO_COMPLETENESS_FIELDS = ["hours", "phone", "parking", "entryFee", "website"] as const;

/**
 * 편의시설 점수 = 대형견 가능(34) + 실내외 동반 범위(both 33 / 일부 20) + 정보 완성도(최대 33).
 *
 * "펫 메뉴 보유"는 폐지했습니다 — 어떤 공공데이터도 펫 메뉴 여부를 분류해서 제공하지 않아
 * 사용자가 직접 제보한 소수 장소만 점수를 받고, 공공데이터 기반 장소(전체 대다수)는
 * 구조적으로 항상 0점이었습니다. 대신 실제로 이 앱이 다루는 정보(운영시간·전화번호·주차·
 * 입장료·홈페이지)가 얼마나 채워져 있는지를 봅니다 — "방문 전에 확인할 수 있는 정보가
 * 얼마나 충실한가"는 실제로 반려동물과 함께 방문을 계획할 때 유용한 신호이고, 여러 필드에
 * 걸쳐 있어 특정 데이터 출처 하나가 통째로 불리해지지 않습니다.
 */
function amenityScore(amenities: AffinityInput["amenities"]): number {
  let score = 0;
  if (amenities.largeDog) score += AFFINITY_SUBSCORES.AMENITY_LARGE_DOG;
  if (amenities.petZone === "both") score += AFFINITY_SUBSCORES.AMENITY_PET_ZONE_BOTH;
  else if (amenities.petZone) score += AFFINITY_SUBSCORES.AMENITY_PET_ZONE_PARTIAL;

  const filledCount = INFO_COMPLETENESS_FIELDS.filter((field) => hasInfo(amenities[field])).length;
  const infoCompleteness = Math.round(
    (filledCount / INFO_COMPLETENESS_FIELDS.length) * AFFINITY_SUBSCORES.AMENITY_INFO_COMPLETENESS_MAX
  );
  score += infoCompleteness;

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
        reviewSatisfaction * AFFINITY_WEIGHTS.REVIEW_SATISFACTION +
          governmentVerification * AFFINITY_WEIGHTS.GOVERNMENT_VERIFICATION +
          userReaction * AFFINITY_WEIGHTS.USER_REACTION +
          amenity * AFFINITY_WEIGHTS.AMENITY
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
  if (score >= AFFINITY_TIER_THRESHOLDS.GREEN_MIN) return "green";
  if (score >= AFFINITY_TIER_THRESHOLDS.YELLOW_MIN) return "yellow";
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
