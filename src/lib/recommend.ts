// src/lib/recommend.ts
//
// 위치 기반 개인화 맞춤 추천 — Content-Based Filtering
//
// 신청서 1.2)-④ "위치 기반 개인화 맞춤 추천" 항목의 실제 구현입니다.
// 사용자의 현재 위치(거리), 선택한 선호 필터 일치 여부, 편의시설(대형견),
// 신규 등록 여부를 종합해 정렬 우선순위 점수를 계산합니다.
//
// ⚠ "펫 메뉴 보유" 가점은 폐지했습니다 — 어떤 공공데이터(식약처/문화정보원/관광공사)도
// 펫 메뉴 여부를 분류해서 제공하지 않아, 사용자가 직접 제보한 소수 장소만 가점을 받고
// 공공데이터 기반 장소(전체의 대다수)는 구조적으로 항상 가점이 없었습니다.
//
// 협업 필터링(Item2Vec)은 사용자별 행동 로그가 충분히 쌓인 뒤 별도 배치 파이프라인으로
// 고도화할 부분이라, 현재 단계에서는 특성 기반(Content-Based) 스코어링으로 구현했습니다.
//
// 가중치는 모두 scoringConfig.ts의 RECOMMEND_WEIGHTS에 있습니다 — 값을 튜닝할 때는
// 이 파일이 아니라 그쪽을 고치면 됩니다(계산 로직과 정책 값을 분리).
//
// ── 다음 단계: 공원 데이터 반영 (조사 완료, 연동은 추후)
// 행정안전부 "전국도시공원정보표준데이터"(data.go.kr/data/15012890/standard.do)에
// 전국 19,199개 도시공원의 위치·시설 정보가 지자체 매월 갱신 표준 포맷으로 제공됩니다.
// 산책 동선 추천에 반영하려면: (1) 공원 좌표를 장소 데이터와 같은 방식으로 지도에 통합하고,
// (2) calculateRecommendScore에 "가장 가까운 공원까지의 거리" 항목을 가중치로 추가해
// 산책 겸 방문에 유리한 장소가 상위로 오도록 확장하면 됩니다.

import { RECOMMEND_WEIGHTS, RECOMMEND_V2_WEIGHTS } from "@/lib/scoringConfig";

export interface RecommendInput {
  /** 기준 위치(내 위치 또는 검색 중심)로부터의 거리(km). 검색 결과 등 거리 개념이 없으면 null */
  distanceKm: number | null;
  /** 사용자가 현재 선택한 선호 필터(실내/야외/동물병원/동물약국 등)와 일치하는지 */
  matchesSelectedFilter: boolean;
  largeDog?: boolean | null;
  /** 장소 등록 시각(ISO 문자열). 공공데이터 출처처럼 등록일을 알 수 없으면 null/undefined로 전달 */
  createdAt?: string | null;
  /** 이 장소에서 가장 가까운 공원까지의 거리(km). 공원 데이터(parks 테이블)가 아직
   *  없거나 계산하지 않았으면 null/undefined — 그 경우 가점 없이 0으로 처리됩니다. */
  distanceToNearestParkKm?: number | null;
  /** 사장님 프리미엄 등록 장소인지(관리자 승인 + premium_expires_at 유효). */
  isPremium?: boolean | null;
  /** 이 장소가 받은 찜(bookmark) 수. 데이터가 없으면(집계 전) 0으로 취급 — 신규 장소를
   *  불리하게 만들지 않기 위해 감점이 아니라 가점만 있는 보너스입니다. */
  bookmarkCount?: number | null;
  /** 이 장소가 받은 좋아요 수. */
  likeCount?: number | null;
}

export interface RecommendBreakdown {
  distancePenalty: number;
  filterBonus: number;
  largeDogBonus: number;
  newPlaceBonus: number;
  parkBonus: number;
  premiumBonus: number;
  popularityBonus: number;
  total: number;
}

/** 거리(km) → 감점. 거리 정보가 없거나 유효하지 않으면 0(페널티 없음, 예: 이름 검색 결과). */
function distancePenalty(distanceKm: number | null): number {
  if (distanceKm == null || Number.isNaN(distanceKm)) return 0;
  const safeDistance = Math.max(0, distanceKm); // 음수 거리 방어(정상 흐름에서는 발생하지 않음)
  return Math.min(RECOMMEND_WEIGHTS.DISTANCE_PENALTY_MAX, safeDistance * RECOMMEND_WEIGHTS.DISTANCE_PENALTY_PER_KM);
}

/**
 * 신규 등록 가점: 등록일로부터 NEW_PLACE_WINDOW_DAYS(기본 14일) 동안 선형으로 감소.
 * createdAt이 없거나(공공데이터 등 등록일을 알 수 없는 출처), 미래 시각이거나,
 * 파싱 실패한 값이면 가점 없이 0을 반환합니다.
 */
function newPlaceBonus(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return 0;

  const days = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  if (days < 0 || days > RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS) return 0;

  const decayPerDay = RECOMMEND_WEIGHTS.NEW_PLACE_BONUS_MAX / RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS;
  return Math.max(0, RECOMMEND_WEIGHTS.NEW_PLACE_BONUS_MAX - days * decayPerDay);
}

/**
 * 산책 겸 방문 가점: 가장 가까운 공원이 PARK_PROXIMITY_MAX_KM 이내면, 가까울수록
 * 선형으로 큰 가점(0km에서 최댓값, 그 거리에서 0). 공원 데이터가 없으면(null) 0점.
 */
function parkProximityBonus(distanceToNearestParkKm: number | null | undefined): number {
  if (distanceToNearestParkKm == null || Number.isNaN(distanceToNearestParkKm)) return 0;
  const safeDistance = Math.max(0, distanceToNearestParkKm);
  if (safeDistance >= RECOMMEND_WEIGHTS.PARK_PROXIMITY_MAX_KM) return 0;
  const ratio = 1 - safeDistance / RECOMMEND_WEIGHTS.PARK_PROXIMITY_MAX_KM;
  return ratio * RECOMMEND_WEIGHTS.PARK_PROXIMITY_BONUS_MAX;
}

/**
 * 인기도 가점: 찜·좋아요를 많이 받은 장소일수록 가점(상한 있음). 지금은 초기 단계라
 * 데이터가 적어 순위에 큰 영향은 없지만, 데이터가 쌓일수록 "찜/추천을 많이 받은 곳"이
 * 자연스럽게 상위로 올라오도록 하는 장치입니다 — 별도 배치 없이 reactions 집계만으로
 * 바로 작동합니다.
 */
function popularityBonus(bookmarkCount: number | null | undefined, likeCount: number | null | undefined): number {
  const bookmarks = Math.max(0, bookmarkCount ?? 0);
  const likes = Math.max(0, likeCount ?? 0);
  const raw = bookmarks * RECOMMEND_WEIGHTS.POPULARITY_BOOKMARK_PER + likes * RECOMMEND_WEIGHTS.POPULARITY_LIKE_PER;
  return Math.min(RECOMMEND_WEIGHTS.POPULARITY_BONUS_MAX, raw);
}

// ── 0~100점 정규화 ──
// 예전에는 BASE_SCORE(100)에서 거리 감점을 빼고 가점(필터/대형견/신규)을 더하기만 해서,
// 이론상 40~133점 사이로 나왔습니다(가점이 겹치면 100점을 넘어가버림 — "몇 점 만점인지"
// 알 수 없는 상태였습니다). 이제는 가중치로 계산되는 이론적 최솟값/최댓값을 구해서
// 그 구간을 0~100으로 선형 재매핑합니다 — 순위(정렬 순서)는 완전히 그대로 유지되면서,
// 실제로 표시되는 점수는 항상 "100점 만점" 안에서 전체 구간을 고르게 씁니다.
const RAW_MIN =
  RECOMMEND_WEIGHTS.BASE_SCORE - RECOMMEND_WEIGHTS.DISTANCE_PENALTY_MAX;
const RAW_MAX =
  RECOMMEND_WEIGHTS.BASE_SCORE +
  RECOMMEND_WEIGHTS.FILTER_MATCH_BONUS +
  RECOMMEND_WEIGHTS.LARGE_DOG_BONUS +
  RECOMMEND_WEIGHTS.NEW_PLACE_BONUS_MAX +
  RECOMMEND_WEIGHTS.PARK_PROXIMITY_BONUS_MAX +
  RECOMMEND_WEIGHTS.PREMIUM_BONUS +
  RECOMMEND_WEIGHTS.POPULARITY_BONUS_MAX;

function normalizeTo100(raw: number): number {
  const ratio = (raw - RAW_MIN) / (RAW_MAX - RAW_MIN);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** 정렬용 점수의 세부 내역까지 반환(디버깅/설명용). 정렬에는 total만 쓰면 됩니다. */
export function calculateRecommendBreakdown(input: RecommendInput): RecommendBreakdown {
  const dPenalty = distancePenalty(input.distanceKm);
  const filterBonus = input.matchesSelectedFilter ? RECOMMEND_WEIGHTS.FILTER_MATCH_BONUS : 0;
  const largeDogBonus = input.largeDog ? RECOMMEND_WEIGHTS.LARGE_DOG_BONUS : 0;
  const nBonus = newPlaceBonus(input.createdAt);
  const pBonus = parkProximityBonus(input.distanceToNearestParkKm);
  const premiumBonus = input.isPremium ? RECOMMEND_WEIGHTS.PREMIUM_BONUS : 0;
  const popBonus = popularityBonus(input.bookmarkCount, input.likeCount);

  const raw = RECOMMEND_WEIGHTS.BASE_SCORE - dPenalty + filterBonus + largeDogBonus + nBonus + pBonus + premiumBonus + popBonus;
  const total = normalizeTo100(raw);

  return {
    distancePenalty: Math.round(dPenalty),
    filterBonus,
    largeDogBonus,
    newPlaceBonus: Math.round(nBonus),
    parkBonus: Math.round(pBonus),
    premiumBonus,
    popularityBonus: Math.round(popBonus * 10) / 10,
    total,
  };
}

export function calculateRecommendScore(input: RecommendInput): number {
  return calculateRecommendBreakdown(input).total;
}

// ═════════════════════════════════════════════════════════════════════
// 추천 v2 — 후보 생성 → 점수 계산 → 재정렬(다양성) 3단계 구조
// (Google Recommendation Systems 강의의 candidate generation / scoring / re-ranking,
//  오늘의집 Twiddler 방식의 노출 조정 참고). v1(calculateRecommendScore)은 A/B 비교와
//  롤백을 위해 그대로 둡니다 — 어느 쪽을 쓸지는 experiment.ts가 사용자별로 정합니다.
// ═════════════════════════════════════════════════════════════════════

export const RECOMMEND_ALGO_VERSION = { v1: "rule-v1", v2: "rule-v2" } as const;

/** /api/recommend/signals가 장소별로 내려주는 집계 신호 */
export interface PlaceSignals {
  /** 찜 수(원본) */
  b: number;
  /** 좋아요 수(원본) */
  l: number;
  /** 싫어요 수(원본) */
  d: number;
  /** 시간 감쇠를 적용한 찜 수 */
  bd: number;
  /** 시간 감쇠를 적용한 좋아요 수 */
  ld: number;
  /** 리뷰 만족도(0~100). 리뷰가 없으면 null */
  rs: number | null;
  /** 리뷰 수 */
  rc: number;
}

/** 카테고리 문자열 정규화 — "동물병원(24시)" → "동물병원" 처럼 출처별 표기 차이를 흡수 */
export function categoryKey(category: string | null | undefined): string {
  const key = (category || "").replace(/\(.*?\)/g, "").trim();
  return key || "기타";
}

// ── 개인화: 사용자 취향 프로필 ──────────────────────────────────────────
export interface UserReaction {
  place_id: string | number;
  type: string; // "bookmark" | "like" | "dislike"
}

export interface PreferencePlaceInfo {
  category?: string | null;
  pet_zone?: string | null;
}

export interface UserPreferenceProfile {
  categoryWeights: Map<string, number>;
  petZoneWeights: Map<string, number>;
  totalWeight: number;
  /** 취향 추정에 쓰인 긍정 반응 장소 수 */
  signalCount: number;
  bookmarked: Set<string>;
  disliked: Set<string>;
}

export const EMPTY_PREFERENCE_PROFILE: UserPreferenceProfile = {
  categoryWeights: new Map(),
  petZoneWeights: new Map(),
  totalWeight: 0,
  signalCount: 0,
  bookmarked: new Set(),
  disliked: new Set(),
};

/**
 * 내 반응(찜/좋아요/싫어요)으로 취향 프로필을 만듭니다. 찜은 좋아요보다 강한 신호로
 * 봅니다(재방문 의사). lookup으로 장소 정보를 못 찾는 반응(삭제된 장소 등)은 건너뜁니다.
 */
export function buildUserPreferenceProfile(
  reactions: UserReaction[],
  lookup: (placeId: string) => PreferencePlaceInfo | undefined
): UserPreferenceProfile {
  const categoryWeights = new Map<string, number>();
  const petZoneWeights = new Map<string, number>();
  const bookmarked = new Set<string>();
  const disliked = new Set<string>();
  const positivePlaces = new Map<string, number>();

  for (const r of reactions) {
    const id = String(r.place_id);
    if (r.type === "dislike") {
      disliked.add(id);
      continue;
    }
    const w = r.type === "bookmark" ? 1 : r.type === "like" ? 0.7 : 0;
    if (w === 0) continue;
    if (r.type === "bookmark") bookmarked.add(id);
    positivePlaces.set(id, Math.max(positivePlaces.get(id) ?? 0, w));
  }

  let totalWeight = 0;
  let signalCount = 0;
  for (const [id, w] of positivePlaces) {
    if (disliked.has(id)) continue;
    const info = lookup(id);
    if (!info) continue;
    signalCount++;
    totalWeight += w;
    const cat = categoryKey(info.category);
    categoryWeights.set(cat, (categoryWeights.get(cat) ?? 0) + w);
    if (info.pet_zone) petZoneWeights.set(info.pet_zone, (petZoneWeights.get(info.pet_zone) ?? 0) + w);
  }

  return { categoryWeights, petZoneWeights, totalWeight, signalCount, bookmarked, disliked };
}

/** 이 장소가 내 취향과 얼마나 맞는지 0~1. 신호가 부족하면 0(가점 없음). */
export function personalMatch(profile: UserPreferenceProfile, place: PreferencePlaceInfo): number {
  if (profile.signalCount < RECOMMEND_V2_WEIGHTS.PERSONAL_MIN_SIGNALS || profile.totalWeight <= 0) return 0;
  const catShare = (profile.categoryWeights.get(categoryKey(place.category)) ?? 0) / profile.totalWeight;
  const zoneShare = place.pet_zone ? (profile.petZoneWeights.get(place.pet_zone) ?? 0) / profile.totalWeight : 0;
  return Math.max(0, Math.min(1, catShare * 0.7 + zoneShare * 0.3));
}

// ── v2 점수 ────────────────────────────────────────────────────────────
export interface RecommendV2Input {
  distanceKm: number | null;
  matchesSelectedFilter: boolean;
  largeDog?: boolean | null;
  createdAt?: string | null;
  distanceToNearestParkKm?: number | null;
  /** 시간 감쇠 적용 찜 수 */
  bookmarksDecayed?: number | null;
  /** 시간 감쇠 적용 좋아요 수 */
  likesDecayed?: number | null;
  /** 친화도 점수(0~100, affinityScore.ts). 계산할 수 없으면 null — 가·감점 없음 */
  affinityScore?: number | null;
  /** 취향 일치도 0~1 (personalMatch) */
  personalMatch?: number | null;
  isDisliked?: boolean;
  isBookmarked?: boolean;
  /** 최근 FATIGUE_WINDOW_DAYS 동안 클릭 없이 추천 목록에 노출된 횟수 */
  impressionCount?: number | null;
}

export interface RecommendV2Breakdown {
  distancePenalty: number;
  filterBonus: number;
  largeDogBonus: number;
  newPlaceBonus: number;
  parkBonus: number;
  popularityBonus: number;
  qualityAdjust: number;
  personalBonus: number;
  feedbackPenalty: number;
  fatiguePenalty: number;
  /** 정렬용 원점수(정규화 전) — 표시 점수가 같아도 순서를 안정적으로 가르기 위함 */
  raw: number;
  total: number;
}

/** 포화 곡선 인기도: 초반 반응에는 민감하고, 많아질수록 완만하게 상한에 수렴 */
export function popularityBonusV2(bookmarksDecayed: number, likesDecayed: number): number {
  const raw =
    Math.max(0, bookmarksDecayed) * RECOMMEND_WEIGHTS.POPULARITY_BOOKMARK_PER +
    Math.max(0, likesDecayed) * RECOMMEND_WEIGHTS.POPULARITY_LIKE_PER;
  return RECOMMEND_WEIGHTS.POPULARITY_BONUS_MAX * (1 - Math.exp(-raw / RECOMMEND_V2_WEIGHTS.POPULARITY_SATURATION_K));
}

/** 친화도 → 가·감점. 기준점(QUALITY_PIVOT)보다 높으면 가점, 낮으면 감점 */
export function qualityAdjustment(affinity: number | null | undefined): number {
  if (affinity == null || Number.isNaN(affinity)) return 0;
  const a = Math.max(0, Math.min(100, affinity));
  const pivot = RECOMMEND_V2_WEIGHTS.QUALITY_PIVOT;
  if (a >= pivot) return ((a - pivot) / (100 - pivot)) * RECOMMEND_V2_WEIGHTS.QUALITY_BONUS_MAX;
  return -((pivot - a) / pivot) * RECOMMEND_V2_WEIGHTS.QUALITY_PENALTY_MAX;
}

export function fatiguePenalty(impressionCount: number | null | undefined): number {
  const n = Math.max(0, impressionCount ?? 0) - RECOMMEND_V2_WEIGHTS.FATIGUE_FREE_IMPRESSIONS;
  if (n <= 0) return 0;
  return Math.min(RECOMMEND_V2_WEIGHTS.FATIGUE_PENALTY_MAX, n * RECOMMEND_V2_WEIGHTS.FATIGUE_PENALTY_PER);
}

// 표시 점수(0~100) 정규화 구간. 개인 피드백 감점(싫어요/찜/피로도)은 "이 사람에게 덜
// 보여주기" 위한 정렬용이라 구간 계산에서 빼고 0에서 잘라냅니다 — 그래야 일반적인
// 장소들의 점수가 좁은 구간에 뭉치지 않고 0~100을 고르게 씁니다.
const RAW_MIN_V2 =
  RECOMMEND_WEIGHTS.BASE_SCORE - RECOMMEND_WEIGHTS.DISTANCE_PENALTY_MAX - RECOMMEND_V2_WEIGHTS.QUALITY_PENALTY_MAX;
const RAW_MAX_V2 =
  RECOMMEND_WEIGHTS.BASE_SCORE +
  RECOMMEND_WEIGHTS.FILTER_MATCH_BONUS +
  RECOMMEND_WEIGHTS.LARGE_DOG_BONUS +
  RECOMMEND_WEIGHTS.NEW_PLACE_BONUS_MAX +
  RECOMMEND_WEIGHTS.PARK_PROXIMITY_BONUS_MAX +
  RECOMMEND_WEIGHTS.POPULARITY_BONUS_MAX +
  RECOMMEND_V2_WEIGHTS.QUALITY_BONUS_MAX +
  RECOMMEND_V2_WEIGHTS.PERSONAL_BONUS_MAX;

export function calculateRecommendBreakdownV2(input: RecommendV2Input): RecommendV2Breakdown {
  const dPenalty = distancePenalty(input.distanceKm);
  const filterBonus = input.matchesSelectedFilter ? RECOMMEND_WEIGHTS.FILTER_MATCH_BONUS : 0;
  const largeDogBonus = input.largeDog ? RECOMMEND_WEIGHTS.LARGE_DOG_BONUS : 0;
  const nBonus = newPlaceBonus(input.createdAt);
  const pBonus = parkProximityBonus(input.distanceToNearestParkKm);
  const popBonus = popularityBonusV2(input.bookmarksDecayed ?? 0, input.likesDecayed ?? 0);
  const quality = qualityAdjustment(input.affinityScore);
  const personal = Math.max(0, Math.min(1, input.personalMatch ?? 0)) * RECOMMEND_V2_WEIGHTS.PERSONAL_BONUS_MAX;
  const feedback =
    (input.isDisliked ? RECOMMEND_V2_WEIGHTS.DISLIKED_PENALTY : 0) +
    (input.isBookmarked ? RECOMMEND_V2_WEIGHTS.ALREADY_BOOKMARKED_PENALTY : 0);
  const fatigue = fatiguePenalty(input.impressionCount);

  const raw =
    RECOMMEND_WEIGHTS.BASE_SCORE - dPenalty + filterBonus + largeDogBonus + nBonus + pBonus + popBonus + quality + personal -
    feedback -
    fatigue;
  const ratio = (raw - RAW_MIN_V2) / (RAW_MAX_V2 - RAW_MIN_V2);
  const total = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  return {
    distancePenalty: Math.round(dPenalty),
    filterBonus,
    largeDogBonus,
    newPlaceBonus: Math.round(nBonus),
    parkBonus: Math.round(pBonus),
    popularityBonus: Math.round(popBonus * 10) / 10,
    qualityAdjust: Math.round(quality * 10) / 10,
    personalBonus: Math.round(personal * 10) / 10,
    feedbackPenalty: feedback,
    fatiguePenalty: fatigue,
    raw,
    total,
  };
}

/**
 * 추천 이유 한 줄 — 점수 내역에서 가장 크게 기여한 긍정 요인을 사람이 읽을 수 있는 말로
 * 바꿉니다. 다양성 재정렬 때문에 점수가 목록 순서와 꼭 일치하지 않으므로, 목록에는 숫자
 * 대신 "왜 추천됐는지"를 보여줍니다(설명 가능한 추천). 해당 요인이 없으면 null.
 */
export function recommendReasons(
  b: RecommendV2Breakdown,
  distanceKm: number | null,
  opts: { reviewCount?: number } = {}
): string[] {
  // 우선순위 순. 흔해서 변별력이 없는 요인(도심에선 거의 모든 곳이 공원 근처)은 기준을
  // 높게 잡고, "평판"은 실제 리뷰가 있을 때만 말합니다(공공데이터 검증만으로 좋다고 하지 않음).
  const reasons: string[] = [];
  if (b.personalBonus >= 3) reasons.push("내 취향과 비슷해요");
  if (b.qualityAdjust >= 3 && (opts.reviewCount ?? 0) > 0) reasons.push("리뷰 평이 좋아요");
  if (b.popularityBonus >= 4) reasons.push("찜이 많아요");
  if (b.newPlaceBonus >= 3) reasons.push("새로 등록됐어요");
  if (b.largeDogBonus > 0) reasons.push("대형견 동반 가능");
  if (distanceKm != null && distanceKm < 0.3) reasons.push("바로 근처예요");
  if (b.parkBonus >= 6) reasons.push("산책할 공원이 바로 옆");
  return reasons;
}

/**
 * 목록 전체를 보고 각 항목의 이유를 하나씩 고릅니다. 목록 대부분(40% 초과)에 똑같이 붙는
 * 이유는 변별력이 없으므로(예: 한 동네 전부 "대형견 동반 가능") 건너뛰고 그 항목만의 다음
 * 이유를 씁니다. 남는 이유가 없으면 null(화면엔 거리만 표시).
 */
export function pickDistinctReasons(reasonLists: string[][]): (string | null)[] {
  const freq = new Map<string, number>();
  for (const list of reasonLists) for (const r of new Set(list)) freq.set(r, (freq.get(r) ?? 0) + 1);
  const limit = Math.max(1, Math.floor(reasonLists.length * 0.4));
  return reasonLists.map((list) => list.find((r) => (freq.get(r) ?? 0) <= limit) ?? null);
}

// ── 재정렬: 다양성 ─────────────────────────────────────────────────────
export interface ScoredCandidate<T> {
  place: T;
  score: number;
  /** 정렬용 원점수(정규화·반올림 전). 없으면 score 사용 */
  rawScore?: number;
  category: string;
  /** 추천 이유 후보(recommendReasons) — pickDistinctReasons로 하나를 골라 화면에 표시 */
  reasons?: string[];
  distanceKm?: number | null;
}

/**
 * 점수 순으로 하나씩 뽑되, 이미 뽑힌 같은 카테고리 수만큼 감점해서 한 카테고리가 목록을
 * 독점하지 않게 합니다(MMR 방식의 단순화 버전). 표시 점수(score)는 바꾸지 않고 순서만
 * 조정합니다.
 */
export function rerankForDiversity<T>(candidates: ScoredCandidate<T>[], topN: number): ScoredCandidate<T>[] {
  // 상위권만 재정렬 대상으로 삼으면 충분합니다(하위 후보가 다양성 보정만으로 올라올 수
  // 있는 폭은 제한적) — 후보 전체를 매 라운드 훑지 않도록 미리 자릅니다.
  const pool = [...candidates]
    .sort((a, b) => (b.rawScore ?? b.score) - (a.rawScore ?? a.score))
    .slice(0, Math.max(topN * 5, 50));
  const picked: ScoredCandidate<T>[] = [];
  const categoryCount = new Map<string, number>();
  const penalty = RECOMMEND_V2_WEIGHTS.DIVERSITY_PENALTY_PER_SAME_CATEGORY;

  while (picked.length < topN && pool.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const value = (c.rawScore ?? c.score) - (categoryCount.get(c.category) ?? 0) * penalty;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }
    const [chosen] = pool.splice(bestIdx, 1);
    picked.push(chosen);
    categoryCount.set(chosen.category, (categoryCount.get(chosen.category) ?? 0) + 1);
  }
  return picked;
}
