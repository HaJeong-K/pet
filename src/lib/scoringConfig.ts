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
// 1-b) 추천 v2 — recommend.ts의 calculateRecommendBreakdownV2 / rerankRecommendations
//   v1 대비 바뀐 점:
//   - 인기도: 반응 수 그대로 합산 → 시간 감쇠(반감기) + 포화 곡선(적은 표본 과대평가 방지)
//   - 품질: 친화도 점수(리뷰 만족도·검증·반응·편의시설)를 정렬에 반영(좋을수록 가점, 나쁠수록 감점)
//   - 개인화: 내가 찜/좋아요한 장소의 카테고리·동반범위 취향과 비슷할수록 가점, 싫어요한 곳은 감점
//   - 노출 피로도: 여러 번 추천됐는데 한 번도 안 누른 장소는 소폭 감점
//   - 프리미엄: 정렬 점수에서 제외하고 "광고" 슬롯으로 분리(recommend 패널 최상단 1칸)
//   - 재정렬: 같은 카테고리가 연달아 몰리지 않도록 다양성 보정
// ─────────────────────────────────────────────────────────────
export const RECOMMEND_V2_WEIGHTS = {
  /** 반응 시간 감쇠 반감기(일). 90일 전 찜은 오늘 찜의 절반 가치 */
  REACTION_HALF_LIFE_DAYS: 90,
  /** 인기도 포화 곡선 계수: bonus = MAX × (1 − e^(−raw / K)). raw가 K일 때 최댓값의 63% */
  POPULARITY_SATURATION_K: 8,
  /** 품질(친화도) 가점 최댓값 — 친화도 100점일 때 */
  QUALITY_BONUS_MAX: 12,
  /** 품질 감점 최댓값 — 친화도가 매우 낮을 때(리뷰 평이 나쁘거나 싫어요가 많음) */
  QUALITY_PENALTY_MAX: 12,
  /** 친화도 기준점: 이 점수면 가·감점 0 (데이터가 없는 장소의 대략적인 기본 점수대) */
  QUALITY_PIVOT: 65,
  /** 개인 취향 일치 가점 최댓값 */
  PERSONAL_BONUS_MAX: 10,
  /** 개인화 신호로 인정하는 최소 반응 수(이보다 적으면 취향 추정이 불안정해 가점 없음) */
  PERSONAL_MIN_SIGNALS: 2,
  /** 내가 "싫어요" 누른 장소 감점 */
  DISLIKED_PENALTY: 30,
  /** 이미 찜한 장소 감점 — 추천은 "새로 발견할 곳" 위주로, 찜한 곳은 찜 목록에서 확인 */
  ALREADY_BOOKMARKED_PENALTY: 6,
  /** 노출 피로도: 이 횟수까지는 감점 없음 */
  FATIGUE_FREE_IMPRESSIONS: 3,
  /** 그 이후 노출 1회당 감점 */
  FATIGUE_PENALTY_PER: 2,
  /** 노출 피로도 감점 최댓값 */
  FATIGUE_PENALTY_MAX: 8,
  /** 노출 피로도 기록 유지 기간(일) — 이 기간이 지나면 초기화 */
  FATIGUE_WINDOW_DAYS: 7,
  /** 다양성 재정렬: 이미 뽑힌 같은 카테고리 1개당 감점 */
  DIVERSITY_PENALTY_PER_SAME_CATEGORY: 5,
  /** 광고(프리미엄) 슬롯 노출 최대 거리(km) — 이보다 멀면 광고를 띄우지 않음 */
  AD_SLOT_MAX_DISTANCE_KM: 10,
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

// ─────────────────────────────────────────────────────────────
// 3) 리스트 카드 배지 (TOP N / HOT / NEW) — KakaoMap.tsx
//    카드 썸네일 우측 상단에 뜨는 배지 기준값입니다. 한 카드에는 하나만 뜨며,
//    TOP 랭킹 > NEW > HOT 순으로 우선합니다(KakaoMap.tsx의 getCardBadge 참고).
// ─────────────────────────────────────────────────────────────
export const CARD_BADGE = {
  /** "TOP n" 배지를 매기는 상한 순위. 화면에 보이는(또는 반경 내) 장소를 찜+좋아요
   *  기준으로 정렬해 이 순위 안에 들고 점수가 0보다 큰 장소에만 매깁니다. */
  TOP_RANK_MAX: 10,
  /** 최근 30일 조회수가 이 값 이상이면 "HOT" 배지. TOP 랭킹에 이미 들어간 장소는
   *  중복으로 붙이지 않습니다. */
  HOT_VIEW_MIN: 15,
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
  /** 좋아요 비율의 베이지안 평활 강도(가상 투표 수). 투표가 적을 때 비율이 중립값(60%)
   *  쪽으로 당겨져서, 좋아요 1개(100%)짜리 장소가 좋아요 90·싫어요 10(90%)인 장소보다
   *  높게 나오는 소표본 왜곡을 막습니다(Evan Miller, "How Not To Sort By Average Rating"). */
  VOTE_PRIOR_STRENGTH: 5,

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
