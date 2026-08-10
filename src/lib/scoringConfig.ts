// src/lib/scoringConfig.ts
//
// AI 추천 시스템(recommend.ts) + 반려동물 친화도 점수(affinityScore.ts)가 쓰는
// 모든 가중치·기준값을 한 곳에 모아둔 설정 파일입니다.
//
// 이전에는 100, 6, 60, 15, 8, 7, 10, 14, 0.45, 0.25, 0.2, 0.1, 34, 33, 20, 60, 65, 100, 40 …
// 같은 매직넘버가 recommend.ts / affinityScore.ts 함수 본문 곳곳에 흩어져 있어서,
// (1) 값의 의미를 코드만 보고 알기 어렵고 (2) 신청서에 적은 가중치와 실제 코드가
// 일치하는지 한눈에 검증하기 어렵고 (3) 나중에 KoBERT/AWS Comprehend 등 실제 모델로
// 교체하며 튜닝할 때 값을 찾아 고치기 번거롭다는 문제가 있었습니다.
// 이 파일 하나만 보면 전체 스코어링 로직의 "정책"을 파악할 수 있도록 재구성했습니다.

// ─────────────────────────────────────────────────────────────
// 1) 위치 기반 개인화 추천 (Content-Based Filtering) — recommend.ts
// ─────────────────────────────────────────────────────────────
export const RECOMMEND_WEIGHTS = {
  /** 모든 장소의 시작 점수 */
  BASE_SCORE: 100,
  /** 거리 1km당 감점 */
  DISTANCE_PENALTY_PER_KM: 6,
  /** 거리 감점의 최댓값(이보다 멀어도 더 깎지 않음) */
  DISTANCE_PENALTY_MAX: 60,
  /** 사용자가 선택한 필터(실내/야외/동물병원/동물약국 등)와 일치할 때 가점 */
  FILTER_MATCH_BONUS: 15,
  /** 대형견 동반 가능 시설일 때 가점 */
  LARGE_DOG_BONUS: 8,
  /** 신규 등록 장소 가점의 최댓값(등록 당일 기준) */
  NEW_PLACE_BONUS_MAX: 10,
  /** 신규 등록 가점이 유지되는 기간(일). 이 기간이 지나면 가점 0으로 선형 감소 */
  NEW_PLACE_WINDOW_DAYS: 14,
  /** 산책 겸 방문 가점: 가장 가까운 공원이 PARK_PROXIMITY_MAX_KM 이내면 가점,
   *  가까울수록 선형으로 커짐(0km일 때 최댓값). 공원 데이터(parks 테이블)가
   *  없거나 근처에 공원이 없으면 0점 — 감점이 아니라 가점만 있는 보너스입니다. */
  PARK_PROXIMITY_BONUS_MAX: 8,
  /** 이 거리(km) 밖의 공원은 "가깝다"고 보지 않음(가점 0) */
  PARK_PROXIMITY_MAX_KM: 1,
  /** 사장님 프리미엄 등록 장소 가점. 광고/노출 효과가 유료 모델의 핵심 가치라
   *  다른 가점보다 크게 잡았지만, 거리 감점(최대 60점)을 뒤집을 만큼 크지는
   *  않게 해서 "너무 멀어서 의미 없는 프리미엄 장소"가 상위로 오지 않도록 했습니다. */
  PREMIUM_BONUS: 12,
  /** 찜(bookmark) 1개당 가점 */
  POPULARITY_BOOKMARK_PER: 1.2,
  /** 좋아요 1개당 가점 — 찜보다 재방문 의사가 약한 신호라 찜보다 살짝 낮게 잡았습니다 */
  POPULARITY_LIKE_PER: 0.8,
  /** 인기도 가점의 최댓값. 찜/좋아요가 아무리 많아도 이 이상 쏠리지 않도록 상한을 둡니다
   *  (신규 인기 장소가 초기 데이터 부족으로 계속 밀리지 않게, 거리·필터 가점과 비슷한
   *  체급으로 맞췄습니다). */
  POPULARITY_BONUS_MAX: 15,
} as const;

// ─────────────────────────────────────────────────────────────
// 2) 반려동물 친화도 점수 (0~100) — affinityScore.ts
//    신청서에 명시한 4대 가중치. 합은 반드시 1이어야 하며, 아래 모듈 로드 시점에
//    자동으로 검증합니다(합이 어긋나면 개발 중 바로 에러로 드러나도록).
// ─────────────────────────────────────────────────────────────
export const AFFINITY_WEIGHTS = {
  REVIEW_SATISFACTION: 0.45,
  GOVERNMENT_VERIFICATION: 0.25,
  USER_REACTION: 0.2,
  AMENITY: 0.1,
} as const;

/** 각 하위 점수 계산에 쓰이는 세부 기준값 */
export const AFFINITY_SUBSCORES = {
  // ── 리뷰 만족도 ──
  /** 리뷰가 아예 없을 때의 중립값 */
  NO_REVIEW_NEUTRAL: 60,
  /** 리뷰는 있지만 긍/부정 키워드가 하나도 안 걸릴 때의 중립값 */
  NEUTRAL_REVIEW_NO_SIGNAL: 65,
  /** 리뷰의 "좋아요" 수 1개당 가중치에 더해지는 값(신뢰도 높은 리뷰에 더 큰 비중) */
  REVIEW_LIKE_WEIGHT_STEP: 1,
  /** 리뷰 1건이 가질 수 있는 최대 가중치(좋아요가 아무리 많아도 이 이상 쏠리지 않도록) */
  REVIEW_LIKE_WEIGHT_MAX: 6,

  // ── 공공데이터 검증 ──
  /** 정부 공공데이터(식약처/문광부/관광공사)로 검증된 장소 */
  GOV_VERIFIED: 100,
  /** 사용자 제보만 있는(미검증) 장소 */
  GOV_UNVERIFIED: 40,

  // ── 사용자 반응(좋아요/싫어요/찜) ──
  /** 좋아요·싫어요 투표가 하나도 없을 때의 중립값 */
  NO_VOTES_NEUTRAL: 60,
  /** 찜(북마크) 1개당 가점 */
  BOOKMARK_BONUS_PER: 2,
  /** 찜 가점의 최댓값 */
  BOOKMARK_BONUS_MAX: 20,
  /** 좋아요 비율 점수에 부여하는 비중(나머지가 찜 가점) */
  VOTE_RATIO_WEIGHT: 0.8,

  // ── 편의시설 ──
  // "펫 메뉴 보유" 항목은 폐지했습니다 — 어떤 공공데이터(식약처/문화정보원/관광공사)도
  // 펫 메뉴 여부를 분류해서 제공하지 않아, 사용자가 직접 제보한 소수 장소만 점수를 받고
  // 공공데이터 기반 장소(전체의 대다수)는 구조적으로 항상 0점일 수밖에 없었습니다.
  // 대신 "정보 완성도"(운영시간·전화번호·주차·입장료·홈페이지 중 실제로 채워진 비율)로
  // 대체했습니다 — 이 5개 필드는 공공데이터 소스마다 채워지는 정도는 다르지만 최소
  // 몇 개씩은 걸쳐 있어서, 펫 메뉴처럼 한 소스만 원천적으로 0점인 구조는 아닙니다.
  AMENITY_LARGE_DOG: 34,
  AMENITY_PET_ZONE_BOTH: 33,
  AMENITY_PET_ZONE_PARTIAL: 20,
  /** 정보 완성도 점수의 최댓값(운영시간/전화/주차/입장료/홈페이지 5개 필드 중 채워진 비율에 비례) */
  AMENITY_INFO_COMPLETENESS_MAX: 33,
} as const;

/** 친화도 총점을 신호등(초록/노랑/빨강)으로 나누는 기준 */
export const AFFINITY_TIER_THRESHOLDS = {
  GREEN_MIN: 75,
  YELLOW_MIN: 50,
} as const;

// ── 안전장치: 가중치 합이 1이 아니면 앱 부팅 시점에 바로 에러로 드러나게 합니다.
// (예: 나중에 가중치를 튜닝하다가 합을 안 맞추는 실수를 방지)
const affinityWeightSum = Object.values(AFFINITY_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(affinityWeightSum - 1) > 1e-9) {
  throw new Error(
    `[scoringConfig] AFFINITY_WEIGHTS 합이 1이 아닙니다 (현재 ${affinityWeightSum}). ` +
      `가중치를 수정했다면 합이 1이 되도록 맞춰주세요.`
  );
}
