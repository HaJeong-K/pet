// src/lib/routeRecommend.ts
//
// "AI 맞춤 추천 경로" — 여러 장소를 하나의 산책/이동 코스로 엮어서 추천하는 기능입니다.
// 기존 recommend.ts(개별 장소 정렬 점수)와는 달리, 이 파일은 "역할이 다른 장소 여러 개를
// 지리적으로 말이 되는 순서로 묶는" 문제를 다룹니다.
//
// ⚠ 데이터 현실을 고려한 설계입니다: places.category는 고정된 enum이 아니라 제보자가
// 자유 입력하거나 공공데이터(관광공사/식품안전나라/문화정보원) 출처마다 제각각인 문자열이라
// (동물병원/동물약국만 코드에서 특별 취급), "카페"/"공원"/"관광지" 같은 역할은 카테고리
// 문자열에 대한 느슨한 키워드 매칭(classifyStopRole)으로만 추정할 수 있습니다. 각 정거장의
// "친화도"는 KakaoMap.tsx가 서버 집계 신호로 계산한 친화도 점수(affinityScore.ts, 상세페이지와
// 같은 값)를 붙여주면 그걸 쓰고, 없을 때만 검증 가능한 필드로 추정합니다 — 없는 사실을
// 지어내지 않기 위해 benefit 문구도 실제 필드에서만 생성합니다.

import { haversineKm } from "@/lib/geo";
import { getOpenStatus, type OpenStatus } from "@/lib/openingHours";

export type StopRole = "walk" | "cafe" | "attraction" | "vet" | "pharmacy" | "etc";
// ⚠ "카페 중심"/"비 오는 날" 테마는 제거했습니다(요청). 남은 테마는 산책 중심/관광
// 중심/실내 추천 3개입니다.
export type RouteTheme = "walk" | "attraction" | "indoor";

export interface RoutablePlace {
  id: number | string;
  name: string;
  lat: string | number;
  lng: string | number;
  category?: string | null;
  /** "관광 중심" 테마에서 지역 내(localAreaName 포함 여부) 관광지 여부를 판정하는 데 씁니다. */
  address?: string | null;
  pet_zone?: string | null;
  large_dog?: boolean | null;
  hours?: string | null;
  parking?: string | null;
  entry_fee?: string | null;
  image_url?: string | null;
  is_premium?: boolean | null;
  premium_expires_at?: string | null;
  /** 찜 수. KakaoMap.tsx가 reactions 집계에서 미리 계산해 붙여줍니다. */
  bookmarkCount?: number | null;
  /** 좋아요 수. */
  likeCount?: number | null;
  /** 정기 휴무일 문자열(예: "매주 월요일"). 운영시간 판정에 씁니다(openingHours.ts). */
  closed_days?: string | null;
  /** 친화도 점수(affinityScore.ts, 0~100). KakaoMap.tsx가 서버 집계 신호로 미리 계산해
   *  붙여주면 상세페이지와 같은 점수를 정거장에도 그대로 씁니다. 없으면 필드 기반 추정치. */
  affinityScore?: number | null;
}

export interface RouteStop {
  place: RoutablePlace;
  role: StopRole;
  tags: string[];
  bullets: string[];
  friendliness: number;
  /** 이 정거장에서 다음 정거장까지의 거리(km). 마지막 정거장이면 null. */
  distanceToNextKm: number | null;
}

export interface RouteResult {
  stops: RouteStop[];
  totalDistanceKm: number;
  estimatedMinutes: number;
  avgFriendliness: number;
  /** 코스 출발지(내 위치 또는 검색 중심) — 지도에 그릴 점선이 여기서부터 시작해야 합니다. */
  origin: { lat: number; lng: number };
  /** 출발지에서 첫 정거장까지의 도보 거리(km). */
  distanceFromOriginKm: number;
  /** 거리 출처 — "estimate"(직선거리×보정계수) 또는 "tmap"(실제 보행자 경로) */
  distanceSource: "estimate" | "tmap";
}

const ROLE_LABEL: Record<StopRole, string> = {
  walk: "산책",
  cafe: "카페",
  attraction: "관광",
  vet: "동물병원",
  pharmacy: "동물약국",
  etc: "기타",
};

// 역할별 예상 체류 시간(분) — "예상 시간"은 순수 도보 이동 시간뿐 아니라 각 정거장에서
// 머무는 시간까지 합산해야 실제 코스 소요 시간에 가까워집니다(도보 몇 km만으로는 몇 시간
// 코스가 될 수 없기 때문).
const DWELL_MINUTES: Record<StopRole, number> = {
  walk: 30,
  cafe: 40,
  attraction: 40,
  vet: 15,
  pharmacy: 10,
  etc: 25,
};

const WALK_SPEED_KMH = 4;

/** 카테고리 문자열/이름 키워드로 이 장소가 코스에서 어떤 역할을 하는지 추정합니다. */
export function classifyStopRole(place: RoutablePlace): StopRole {
  const cat = (place.category || "").trim();
  const name = place.name || "";
  // ⚠ 문화정보원 CSV 등 공공데이터는 category가 고정 enum이 아니라 원본 컬럼값을 그대로
  // 쓰기 때문에("동물병원"/"동물약국"이 아니라 "동물병원(24시)"처럼 살짝 다른 문자열이거나,
  // 아예 카테고리 필드가 다르게 채워져 있을 수 있음), category와 name을 함께 봐서 판정
  // 합니다(동물병원·동물약국은 법적으로 상호에 해당 명칭을 쓰도록 되어 있어 이름에 거의
  // 항상 포함됩니다). 정확히 일치(===)가 아니라 포함(includes)으로 판정해야, 이런 변형
  // 문자열도 vet/pharmacy로 분류되어 아래 CRITICAL_ROLES 상한(1개)의 적용을 받고 "기타"로
  // 새서 필러 루프를 통해 중복으로 뽑히는 걸 막을 수 있습니다.
  const combined = `${cat} ${name}`;
  if (combined.includes("동물병원")) return "vet";
  if (combined.includes("동물약국")) return "pharmacy";
  if (cat.includes("카페") || cat.includes("음식점") || cat.includes("쇼핑")) return "cafe";
  if (
    cat.includes("공원") ||
    /해수욕장|해변|숲길|생태공원|수변공원|산책로|둘레길/.test(name + cat)
  ) {
    return "walk";
  }
  if (
    cat.includes("관광") ||
    cat.includes("문화시설") ||
    cat.includes("레포츠") ||
    cat.includes("축제") ||
    cat.includes("여행코스")
  ) {
    return "attraction";
  }
  return "etc";
}

/**
 * 정거장 친화도(0~100). 호출하는 쪽이 affinityScore(상세페이지와 같은 친화도 점수)를
 * 붙여주면 그 값을 그대로 씁니다 — 같은 장소가 상세페이지와 코스에서 다른 점수로 보이던
 * 문제를 없애기 위함입니다. 없을 때만(테스트·집계 신호 로딩 전 등) 예전처럼 검증 가능한
 * 필드만으로 60~98점 추정치를 냅니다.
 */
export function estimateStopFriendliness(place: RoutablePlace): number {
  if (place.affinityScore != null && !Number.isNaN(place.affinityScore)) {
    return Math.max(0, Math.min(100, Math.round(place.affinityScore)));
  }
  let score = 68;
  const role = classifyStopRole(place);
  // ⚠ 동물병원·동물약국은 제보 폼에서 "동반 가능 범위"(pet_zone)를 같이 받긴 하지만,
  // 그건 상세페이지 표시용일 뿐입니다 — "실내외 모두 반려동물 동반 가능한 카페/식당"과
  // 같은 의미의 필드가 아니라서, 이 두 역할은 pet_zone 가점 대상에서 제외합니다.
  if (role !== "vet" && role !== "pharmacy") {
    if (place.pet_zone === "both") score += 15;
    else if (place.pet_zone === "terrace") score += 10;
    else if (place.pet_zone === "indoor") score += 6;
  }
  if (place.large_dog) score += 6;
  if (role === "vet") score += 8;
  if (place.image_url) score += 4;
  if (place.is_premium) score += 2;
  // 찜/좋아요가 많은 곳일수록 가점(상한 있음) — "찜과 추천을 많이 받은 곳을 우선
  // 추천"을 정거장 단위 친화도 표시에도 반영합니다. recommend.ts의 POPULARITY_BONUS와
  // 같은 취지지만, 이쪽은 이미 0~100 점수를 다루는 척도라 자체 가점 상한을 둡니다.
  const popularity = Math.max(0, place.bookmarkCount ?? 0) * 0.8 + Math.max(0, place.likeCount ?? 0) * 0.5;
  score += Math.min(10, popularity);
  return Math.max(60, Math.min(98, Math.round(score)));
}

/** 정거장 선택 시 "거리"에 더해 얼마나 인기 있는 곳인지도 반영하기 위한 가상의 거리
 * 할인(km). 찜/좋아요가 많을수록 실제보다 더 가까운 것처럼 취급해서, 조금 더 멀어도
 * 인기 있는 곳이 코스에 뽑힐 확률을 높입니다 — 다만 상한을 둬서 아주 먼 곳이 인기만으로
 * 코스에 끼어들어 "걸어서 갈 만한 코스"라는 전제를 깨지 않도록 합니다.
 */
function popularityDistanceDiscountKm(place: RoutablePlace): number {
  const popularity = Math.max(0, place.bookmarkCount ?? 0) * 0.15 + Math.max(0, place.likeCount ?? 0) * 0.1;
  return Math.min(0.8, popularity);
}

/** 실제 필드에서만 근거를 뽑아 만드는 이 정거장의 장점 문구(최대 3개). 없는 사실은 지어내지 않습니다. */
export function buildStopBullets(place: RoutablePlace, role: StopRole): string[] {
  const bullets: string[] = [];
  // ⚠ pet_zone은 동물병원·동물약국에서는 상세페이지 표시 전용 필드라, 여기(코스 후보
  // 장점 문구)에는 반영하지 않습니다 — estimateStopFriendliness와 동일한 이유.
  if (role !== "vet" && role !== "pharmacy") {
    if (place.pet_zone === "both") bullets.push("실내외 모두 반려동물 동반 가능");
    else if (place.pet_zone === "terrace") bullets.push("테라스에서 반려동물 동반 가능");
    else if (place.pet_zone === "indoor") bullets.push("실내에서 반려동물 동반 가능");
  }
  if (place.large_dog) bullets.push("대형견 동반 가능");
  if (place.hours && /24\s*시간|24h/i.test(place.hours)) bullets.push("24시간 운영");
  if (place.parking && place.parking !== "정보없음") bullets.push("주차 가능");
  if (role === "vet" && bullets.length < 2) bullets.push("응급 상황 대비 방문 가능");
  if (role === "pharmacy" && bullets.length < 2) bullets.push("반려동물 의약품 구매 가능");
  if (bullets.length === 0) bullets.push("반려동물과 함께 방문하기 좋은 장소입니다");
  return bullets.slice(0, 3);
}

// ── 실제 도보 거리 근사치 ──────────────────────────────────────────────
// 카카오는 보행자(도보) 길찾기 REST API를 공개로 제공하지 않아(자동차 길찾기만 있음),
// 이 앱의 카카오 키로는 실시간으로 "진짜 걸을 수 있는 길"의 정확한 거리를 매 후보마다
// 조회할 방법이 없습니다. 대신 직선거리(haversine)에 보정 계수를 곱해 실제 도보 경로
// 거리에 더 가깝게 근사합니다 — 도심 격자형 도로망 기준으로 도보 이동 거리가 직선거리의
// 약 1.3배 정도 되는 경향을 반영한 값입니다(완벽하진 않지만 순수 직선거리보다는 현실에
// 훨씬 가깝습니다). 정거장 선택과 화면에 표시되는 "다음 정거장까지 거리"에 모두 이
// 보정치를 일관되게 사용합니다.
const WALK_DETOUR_FACTOR = 1.3;
const TARGET_HOP_KM = 2; // 정거장 사이 이상적인 도보 이동 거리
const MAX_HOP_KM = 3.5; // 이 거리를 넘는 후보는 "그나마 나은 후보"가 없을 때만 선택

function estimateWalkKm(straightKm: number): number {
  return straightKm * WALK_DETOUR_FACTOR;
}

// 테마별로 원하는 정거장 "역할" 순서. 실제로 후보가 없는 역할은 건너뜁니다.
// ⚠ 동물병원(vet)·동물약국(pharmacy)은 모든 테마에서 딱 1개씩만 포함합니다 — 산책
// 코스 특성상 응급 상황 대비용으로 "가장 이상적인 곳" 하나씩만 있으면 충분하고, 같은
// 카테고리가 여러 개 섞이면(공공데이터에 병원/약국이 유독 많은 지역이 있음) 코스의
// 다양성이 떨어집니다. CRITICAL_ROLES로 따로 표시해서 나머지 빈 자리를 채우는
// 로직에서 제외합니다(아래 buildRoute 참고).
// ⚠ "attraction" 테마에는 여기 "attraction" 역할을 넣지 않습니다 — 관광 중심 코스는
// 관광지가 "반드시" 포함되어야 해서(요청사항), 일반 role 루프의 "후보 없으면 건너뛰기"
// 방식 대신 buildRoute 맨 앞에서 pickAttractionStop()으로 별도 확정합니다.
const THEME_ROLE_SEQUENCE: Record<RouteTheme, StopRole[]> = {
  walk: ["walk", "cafe", "vet", "pharmacy"],
  attraction: ["cafe", "vet", "pharmacy"],
  indoor: ["cafe", "attraction", "vet", "pharmacy"],
};

const CRITICAL_ROLES: StopRole[] = ["vet", "pharmacy"];

// "관광 중심" 코스에서 지역 내(주소 기준) 관광지가 하나도 없는 외곽지역에 한해서만,
// 이 반경(km) 이내의 타 지역 관광지를 차선으로 허용합니다.
const ATTRACTION_LOCAL_FALLBACK_KM = 5;

function isIndoorFriendly(place: RoutablePlace): boolean {
  // ⚠ 동물병원·동물약국은 pet_zone이 "실내 추천" 테마 후보 분류에 영향을 주면 안 됩니다
  // (상세페이지 표시 전용 필드) — 그 두 역할은 pet_zone 값과 무관하게 원래 로직대로
  // pool 전체에서 필요할 때(critical role) 채워지도록 이 판정에서 제외합니다.
  const role = classifyStopRole(place);
  if (role === "vet" || role === "pharmacy") return false;
  return place.pet_zone === "indoor" || place.pet_zone === "both";
}

/**
 * "관광 중심" 테마 전용 — 실제 관광지 하나를 최우선으로 확보합니다.
 * 1) localAreaName(현재 위치가 속한 읍/면/동)이 주소에 포함되는 "지역 내" 관광지가
 *    있으면 그중 가장 이상적인 곳을 고릅니다.
 * 2) 지역 내에 하나도 없으면("외곽지역") ATTRACTION_LOCAL_FALLBACK_KM(5km) 이내의
 *    타 지역 관광지를 차선으로 허용합니다.
 * 3) 그마저도 없으면 null — 없는 관광지를 지어내지 않고 정직하게 포기합니다.
 * 관광지는 도보권을 벗어나 차로 이동하는 코스도 허용해야 해서(요청사항), 다른 역할과
 * 달리 estimateWalkKm/TARGET_HOP_KM 제약 없이 직선거리 기준으로 고릅니다.
 */
function pickAttractionStop(
  pool: RoutablePlace[],
  used: Set<string | number>,
  center: { lat: number; lng: number },
  localAreaName?: string | null
): RoutablePlace | null {
  const candidates = pool.filter((p) => !used.has(p.id) && classifyStopRole(p) === "attraction");
  if (candidates.length === 0) return null;

  const bestOf = (list: RoutablePlace[]): RoutablePlace | null => {
    if (list.length === 0) return null;
    let best: RoutablePlace | null = null;
    let bestScore = Infinity;
    for (const p of list) {
      const d = haversineKm(center.lat, center.lng, Number(p.lat), Number(p.lng));
      const popDiscount = popularityDistanceDiscountKm(p);
      const idealDiscount = Math.max(0, (estimateStopFriendliness(p) - 70) / 10) * 0.5;
      const score = Math.max(0, d - popDiscount - idealDiscount);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  };

  const localOnes = localAreaName
    ? candidates.filter((p) => typeof p.address === "string" && p.address.includes(localAreaName))
    : [];
  if (localOnes.length > 0) return bestOf(localOnes);

  const nearbyOnes = candidates.filter(
    (p) => haversineKm(center.lat, center.lng, Number(p.lat), Number(p.lng)) <= ATTRACTION_LOCAL_FALLBACK_KM
  );
  return bestOf(nearbyOnes);
}

// ── 코스 최적화 파라미터 ──────────────────────────────────────────────
// 그리디(한 정거장씩 "지금 위치에서 제일 나은 곳")는 앞에서 고른 정거장이 뒤 선택을
// 망쳐도 되돌릴 수 없습니다. 코스 추천 연구의 표준 정식화(Tourist Trip Design Problem /
// Orienteering Problem — "제약 안에서 점수 합이 최대인 장소 조합과 순서")를 따라, 역할별
// 상위 후보 몇 개씩을 뽑아 가능한 조합과 방문 순서를 전부 평가합니다. 역할 4개 × 후보
// 6개면 조합 1,296개 × 순서 최대 24가지 ≈ 3만 번 계산이라 브라우저에서도 수 ms 수준입니다.
const CANDIDATES_PER_SLOT = 6;
/** 정거장 품질(친화도·인기도) 1단위가 도보 거리 몇 km와 맞먹는지 — 클수록 멀어도 좋은 곳을 고름 */
const UTILITY_KM_PER_POINT = 0.05;
/** 운영시간을 알 수 없는 장소의 불이익(km 환산) — 제외하진 않고 확인된 곳을 조금 더 선호 */
const UNKNOWN_HOURS_PENALTY_KM = 0.3;
/** 한 정거장 후보로 인정하는 최대 추정 도보 거리(km). 이보다 먼 곳은 역할이 맞아도 코스에
 *  넣지 않습니다 — "카페 역할을 채우려고 20km 떨어진 카페를 넣는" 식의 걸을 수 없는 코스를
 *  막습니다(차라리 정거장 수를 줄이는 편이 낫다고 판단). */
const MAX_STOP_WALK_KM = 5;

function stopUtilityKm(place: RoutablePlace, role: StopRole): number {
  const friendliness = estimateStopFriendliness(place);
  // 동물병원·약국은 응급 대비용이라 "얼마나 믿을 만한 곳인가"에 더 큰 비중을 둡니다(기존 ideal 로직과 같은 취지)
  const qualityWeight = CRITICAL_ROLES.includes(role) ? 2 : 1;
  return (friendliness - 70) * UTILITY_KM_PER_POINT * qualityWeight + popularityDistanceDiscountKm(place);
}

function hopCost(fromLat: number, fromLng: number, place: RoutablePlace): number {
  const walkKm = estimateWalkKm(haversineKm(fromLat, fromLng, Number(place.lat), Number(place.lng)));
  // TARGET_HOP_KM에 가까울수록 좋고, MAX_HOP_KM을 넘으면 급격히 불리하게(기존 pickBest와 같은 형태)
  return walkKm > MAX_HOP_KM ? MAX_HOP_KM + walkKm : Math.abs(walkKm - TARGET_HOP_KM);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

interface Slot {
  role: StopRole | "any";
  candidates: RoutablePlace[];
}

/**
 * 후보 장소 풀에서 테마에 맞는 정거장(최대 maxStops개)을 골라, 걷기 좋은 순서로 엮습니다.
 *
 * 1) 후보 정리: 좌표 오류 제거, 실내 테마 필터, "지금부터 몇 시간 동안 확실히 문을 닫은 곳" 제거
 * 2) 슬롯 구성: 테마별 역할 순서(THEME_ROLE_SEQUENCE). 동물병원·약국은 후보가 있을 때만
 *    1개씩, 나머지 역할은 후보가 없으면 "아무 역할" 슬롯으로 대체
 * 3) 조합 탐색: 슬롯마다 상위 후보 CANDIDATES_PER_SLOT개 → 모든 조합 × 모든 방문 순서를
 *    평가해서 (도보 구간 비용 − 정거장 품질)이 가장 작은 코스를 고름. 도착 예정 시각에
 *    문을 닫는 곳이 들어간 코스는 제외(운영시간 = 시간 창 제약)
 * 4) 남은 자리는 기존처럼 그리디로 채움
 */
export function buildRoute(
  candidates: RoutablePlace[],
  center: { lat: number; lng: number },
  theme: RouteTheme,
  maxStops = 4,
  options?: {
    /** "관광 중심" 테마에서 지역 내 관광지를 판정할 읍/면/동 이름(reverseGeocodeDong 결과). */
    localAreaName?: string | null;
    /** 이 id들은 후보에서 제외합니다 — "다른 코스 보기"로 이전에 나온 정거장을 뺄 때 씁니다. */
    excludeIds?: Iterable<string | number>;
    /** 코스 출발 시각(운영시간 판정 기준). 기본값은 지금 — 테스트에서 고정할 때 씁니다. */
    startAt?: Date;
  }
): RouteResult | null {
  const startAt = options?.startAt ?? new Date();
  const statusAt = (place: RoutablePlace, minutesFromStart: number): OpenStatus =>
    getOpenStatus(place.hours, place.closed_days, new Date(startAt.getTime() + minutesFromStart * 60_000));

  let pool = candidates.filter((p) => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    return !isNaN(lat) && !isNaN(lng);
  });

  if (theme === "indoor") {
    const indoorPool = pool.filter(isIndoorFriendly);
    if (indoorPool.length >= 2) pool = indoorPool;
  }

  // 출발 시점과 3시간 뒤 모두 "확실히 닫힘"인 곳은 코스 시간 안에 방문할 수 없으므로 미리 뺍니다.
  pool = pool.filter((p) => !(statusAt(p, 0) === "closed" && statusAt(p, 180) === "closed"));

  if (pool.length < 2) return null;

  const used = new Set<string | number>(options?.excludeIds ?? []);
  const available = (p: RoutablePlace) => !used.has(p.id);

  // ── 관광 중심: 관광지를 먼저 확정(요청사항 — 반드시 포함). 관광지까지는 차로 이동하는
  // 코스도 허용해서 도보 구간 비용 계산에서 빠지고, 이후 정거장은 관광지를 기준으로 채웁니다.
  let fixedFirst: RoutablePlace | null = null;
  if (theme === "attraction") {
    fixedFirst = pickAttractionStop(pool, used, center, options?.localAreaName);
    if (fixedFirst) used.add(fixedFirst.id);
  }
  const anchor = fixedFirst ? { lat: Number(fixedFirst.lat), lng: Number(fixedFirst.lng) } : center;
  const anchorDwell = fixedFirst ? DWELL_MINUTES[classifyStopRole(fixedFirst)] : 0;

  const withinWalk = (from: { lat: number; lng: number }, p: RoutablePlace) =>
    estimateWalkKm(haversineKm(from.lat, from.lng, Number(p.lat), Number(p.lng))) <= MAX_STOP_WALK_KM;
  const nonCriticalPool = pool.filter(
    (p) => available(p) && !CRITICAL_ROLES.includes(classifyStopRole(p)) && withinWalk(anchor, p)
  );

  // ── 슬롯 구성 ──
  const slotBudget = maxStops - (fixedFirst ? 1 : 0);
  const slots: Slot[] = [];
  for (const role of THEME_ROLE_SEQUENCE[theme]) {
    if (slots.length >= slotBudget) break;
    const isCritical = CRITICAL_ROLES.includes(role);
    const roleCandidates = pool.filter((p) => available(p) && classifyStopRole(p) === role && withinWalk(anchor, p));
    // 동물병원/약국은 후보가 없으면 다른 역할로 대충 채우지 않습니다("동물약국" 정거장이
    // 실제로는 카페인 상황 방지).
    if (roleCandidates.length === 0) {
      if (isCritical) continue;
      slots.push({ role: "any", candidates: [] });
      continue;
    }
    slots.push({ role, candidates: roleCandidates });
  }


  // 슬롯별 상위 후보 추리기: 기준점에서의 도보 구간 적합도 − 품질이 좋은 순.
  // "any" 슬롯은 병원·약국을 제외한 전체에서 고릅니다.
  const shortlist = (slot: Slot): RoutablePlace[] => {
    const source = slot.role === "any" ? nonCriticalPool : slot.candidates;
    const role = (p: RoutablePlace) => (slot.role === "any" ? classifyStopRole(p) : slot.role);
    return source
      .map((p) => ({ p, cost: hopCost(anchor.lat, anchor.lng, p) - stopUtilityKm(p, role(p)) }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, CANDIDATES_PER_SLOT)
      .map((x) => x.p);
  };
  const slotChoices = slots.map(shortlist).filter((list) => list.length > 0);

  // ── 조합 × 순서 탐색 ──
  let bestPlan: RoutablePlace[] = [];
  let bestCost = Infinity;
  const orderCache = new Map<number, number[][]>();
  const orderIndexes = (n: number) => {
    if (!orderCache.has(n)) orderCache.set(n, permutations([...Array(n).keys()]));
    return orderCache.get(n)!;
  };

  const evaluate = (chosen: RoutablePlace[]) => {
    for (const order of orderIndexes(chosen.length)) {
      let cost = 0;
      let cursor = anchor;
      let minutes = anchorDwell;
      let feasible = true;
      for (const idx of order) {
        const place = chosen[idx];
        const role = classifyStopRole(place);
        const legKm = estimateWalkKm(haversineKm(cursor.lat, cursor.lng, Number(place.lat), Number(place.lng)));
        minutes += (legKm / WALK_SPEED_KMH) * 60;
        const status = statusAt(place, minutes);
        if (status === "closed") {
          feasible = false;
          break;
        }
        cost += hopCost(cursor.lat, cursor.lng, place) - stopUtilityKm(place, role);
        if (status === "unknown") cost += UNKNOWN_HOURS_PENALTY_KM;
        minutes += DWELL_MINUTES[role];
        cursor = { lat: Number(place.lat), lng: Number(place.lng) };
      }
      if (feasible && cost < bestCost) {
        bestCost = cost;
        bestPlan = order.map((i) => chosen[i]);
      }
    }
  };

  // 슬롯마다 후보 하나씩 고르는 모든 조합(같은 장소 중복 선택은 건너뜀)
  const walkCombos = (slotIdx: number, chosen: RoutablePlace[], chosenIds: Set<string | number>) => {
    if (slotIdx === slotChoices.length) {
      if (chosen.length > 0) evaluate(chosen);
      return;
    }
    let placedAny = false;
    for (const p of slotChoices[slotIdx]) {
      if (chosenIds.has(p.id)) continue;
      placedAny = true;
      chosen.push(p);
      chosenIds.add(p.id);
      walkCombos(slotIdx + 1, chosen, chosenIds);
      chosen.pop();
      chosenIds.delete(p.id);
    }
    // 이 슬롯 후보가 전부 앞 슬롯과 겹치면 이 슬롯은 비워두고 진행
    if (!placedAny) walkCombos(slotIdx + 1, chosen, chosenIds);
  };
  walkCombos(0, [], new Set());

  const stops: RouteStop[] = [];
  const pushStop = (picked: RoutablePlace, includeCategoryTag: boolean) => {
    const role = classifyStopRole(picked);
    used.add(picked.id);
    stops.push({
      place: picked,
      role,
      tags: [ROLE_LABEL[role], ...(includeCategoryTag && picked.category && picked.category !== ROLE_LABEL[role] ? [picked.category] : [])],
      bullets: buildStopBullets(picked, role),
      friendliness: estimateStopFriendliness(picked),
      distanceToNextKm: null,
    });
  };

  if (fixedFirst) pushStop(fixedFirst, true);
  for (const p of bestPlan) pushStop(p, true);

  // 정거장이 부족하면(후보가 겹치거나 시간 제약으로 빠진 경우) 남은 풀에서 그리디로 채웁니다.
  // ⚠ 동물병원/동물약국은 위에서 이미 최대 1개씩만 뽑았으므로 여기서는 후보에서 제외합니다.
  let cursor = stops.length > 0
    ? { lat: Number(stops[stops.length - 1].place.lat), lng: Number(stops[stops.length - 1].place.lng) }
    : center;
  while (stops.length < Math.min(maxStops, pool.length)) {
    let best: RoutablePlace | null = null;
    let bestScore = Infinity;
    for (const p of nonCriticalPool) {
      if (used.has(p.id) || !withinWalk(cursor, p)) continue;
      const score = hopCost(cursor.lat, cursor.lng, p) - stopUtilityKm(p, classifyStopRole(p));
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    pushStop(best, false);
    cursor = { lat: Number(best.lat), lng: Number(best.lng) };
  }

  // ⚠ 최종 안전장치: 데이터 소스마다 카테고리·이름 표기가 제각각이라 예기치 못한 경로로
  // 병원/약국 중복이 들어갈 가능성을 완전히 배제할 수 없어 한 번 더 강제합니다.
  const seenCriticalRole = new Set<StopRole>();
  const dedupedStops = stops.filter((stop) => {
    if (!CRITICAL_ROLES.includes(stop.role)) return true;
    if (seenCriticalRole.has(stop.role)) return false;
    seenCriticalRole.add(stop.role);
    return true;
  });

  if (dedupedStops.length < 2) return null;

  // 출발지(내 위치)→첫 정거장 구간도 실제 걷는 구간이라 총 거리/시간에 포함합니다.
  const firstPlace = dedupedStops[0].place;
  const distanceFromOriginKm = estimateWalkKm(
    haversineKm(center.lat, center.lng, Number(firstPlace.lat), Number(firstPlace.lng))
  );

  let totalDistanceKm = distanceFromOriginKm;
  let totalDwellMinutes = 0;
  for (let i = 0; i < dedupedStops.length; i++) {
    totalDwellMinutes += DWELL_MINUTES[dedupedStops[i].role];
    if (i < dedupedStops.length - 1) {
      const a = dedupedStops[i].place;
      const b = dedupedStops[i + 1].place;
      const d = estimateWalkKm(haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)));
      dedupedStops[i].distanceToNextKm = d;
      totalDistanceKm += d;
    }
  }

  const walkMinutes = (totalDistanceKm / WALK_SPEED_KMH) * 60;
  const estimatedMinutes = Math.round(walkMinutes + totalDwellMinutes);
  const avgFriendliness = Math.round(
    dedupedStops.reduce((sum, s) => sum + s.friendliness, 0) / dedupedStops.length
  );

  return {
    stops: dedupedStops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    estimatedMinutes,
    avgFriendliness,
    origin: center,
    distanceFromOriginKm: Math.round(distanceFromOriginKm * 10) / 10,
    distanceSource: "estimate",
  };
}

/**
 * 실제 도보 경로(TMAP 보행자 길찾기, /api/route/walk) 결과로 코스의 거리·시간을 갈아끼웁니다.
 * legsKm[0]은 출발지→첫 정거장, legsKm[i]는 정거장 i→i+1 구간입니다. 구간 수가 맞지 않으면
 * 원래 추정치를 그대로 돌려줍니다(부분 실패로 숫자가 섞이지 않게).
 */
export function applyWalkingLegs(route: RouteResult, legsKm: number[], legsMinutes: number[]): RouteResult {
  if (legsKm.length !== route.stops.length || legsMinutes.length !== route.stops.length) return route;
  const stops = route.stops.map((s, i) => ({
    ...s,
    distanceToNextKm: i < route.stops.length - 1 ? legsKm[i + 1] : null,
  }));
  const totalDistanceKm = legsKm.reduce((a, b) => a + b, 0);
  const walkMinutes = legsMinutes.reduce((a, b) => a + b, 0);
  const dwell = route.stops.reduce((sum, s) => sum + DWELL_MINUTES[s.role], 0);
  return {
    ...route,
    stops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    distanceFromOriginKm: Math.round(legsKm[0] * 10) / 10,
    estimatedMinutes: Math.round(walkMinutes + dwell),
    distanceSource: "tmap",
  };
}

export function formatEstimatedTime(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export const ROUTE_THEME_LABEL: Record<RouteTheme, string> = {
  walk: "산책 중심",
  attraction: "관광 중심",
  indoor: "실내 추천",
};
