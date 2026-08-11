// src/lib/routeRecommend.ts
//
// "AI 맞춤 추천 경로" — 여러 장소를 하나의 산책/이동 코스로 엮어서 추천하는 기능입니다.
// 기존 recommend.ts(개별 장소 정렬 점수)와는 달리, 이 파일은 "역할이 다른 장소 여러 개를
// 지리적으로 말이 되는 순서로 묶는" 문제를 다룹니다.
//
// ⚠ 데이터 현실을 고려한 설계입니다: places.category는 고정된 enum이 아니라 제보자가
// 자유 입력하거나 공공데이터(관광공사/식품안전나라/문화정보원) 출처마다 제각각인 문자열이라
// (동물병원/동물약국만 코드에서 특별 취급), "카페"/"공원"/"관광지" 같은 역할은 카테고리
// 문자열에 대한 느슨한 키워드 매칭(classifyStopRole)으로만 추정할 수 있습니다. 마찬가지로
// 각 정거장의 "친화도" 점수도 리뷰/좋아요 집계가 없는 공공데이터 장소가 대부분이라 실제
// 리뷰 기반 점수(affinityScore.ts)를 코스 후보 전체에 매길 수 없어서, 실제로 검증 가능한
// 필드(pet_zone, large_dog, 이미지 유무, 프리미엄 여부)만으로 추정치를 냅니다 — 없는 사실을
// 지어내지 않기 위해 benefit 문구도 실제 필드에서만 생성합니다.

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
  /** 출발지에서 첫 정거장까지의 도보 거리 추정치(km). */
  distanceFromOriginKm: number;
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
 * 정거장 친화도 추정치(60~98점). 실제 리뷰/좋아요 집계 없이도 낼 수 있는, 검증 가능한
 * 필드만 사용합니다 — 공공데이터 장소가 대부분이라 실제 리뷰 기반 점수를 코스 후보
 * 전체에 매길 방법이 없어서 택한 근사치입니다(recommend.ts의 정렬 점수와는 별개 지표).
 */
export function estimateStopFriendliness(place: RoutablePlace): number {
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

/**
 * 후보 장소 풀에서 테마에 맞는 4개(가능한 만큼) 정거장을 뽑아 지리적으로 말이 되는
 * 순서로 엮습니다. 시작점(currentLat/Lng)에서 가장 가까운 후보부터 그리디 최근접
 * 방식으로 이어붙여서, 코스 순서대로 이동했을 때 왔다갔다 하지 않도록 합니다.
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
  }
): RouteResult | null {
  let pool = candidates.filter((p) => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    return !isNaN(lat) && !isNaN(lng);
  });

  if (theme === "indoor") {
    const indoorPool = pool.filter(isIndoorFriendly);
    if (indoorPool.length >= 2) pool = indoorPool;
  }

  if (pool.length < 2) return null;

  const roleSequence = THEME_ROLE_SEQUENCE[theme];
  const used = new Set<string | number>(options?.excludeIds ?? []);
  const stops: RouteStop[] = [];
  let cursor = center;

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
    cursor = { lat: Number(picked.lat), lng: Number(picked.lng) };
  };

  // "관광 중심" 코스는 관광지가 반드시 포함되어야 해서(요청사항), 나머지 역할을 채우기
  // 전에 먼저 확정합니다 — 이후 cafe/vet/pharmacy는 이 관광지를 기준점 삼아 도보권
  // 안에서 채워집니다.
  if (theme === "attraction") {
    const attractionPick = pickAttractionStop(pool, used, center, options?.localAreaName);
    if (attractionPick) pushStop(attractionPick, true);
  }

  // ideal=true(동물병원/동물약국 전용)면 단순 최근접이 아니라 "얼마나 이상적인 곳인가"
  // (친화도 추정치)에 더 큰 비중을 둬서 고릅니다 — 응급 상황 대비용으로 코스에 넣는
  // 딱 하나뿐인 자리라, 가장 가까운 곳보다 조금 멀어도 더 신뢰할 만한 곳을 우선합니다.
  //
  // ⚠ 거리는 직선(haversine)이 아니라 estimateWalkKm로 보정한 "추정 도보 거리"를 씁니다.
  // 그리고 단순 최근접이 아니라 TARGET_HOP_KM(2km)에 가까운 후보를 우선합니다 — 바로
  // 옆(50m)이나 지나치게 먼 곳(직선상 가까워 보여도 실제로는 다른 블록) 대신, 한 정거장
  // 이동에 걸맞은 "산책 한 구간"만큼 떨어진 곳을 고르기 위함입니다. MAX_HOP_KM을 넘는
  // 후보는 그보다 가까운 후보가 전혀 없을 때만 최후 수단으로 선택합니다(코스 자체가
  // 안 만들어지는 것보다는 낫다는 판단).
  const pickBest = (fromPool: RoutablePlace[], ideal: boolean): RoutablePlace | null => {
    let best: RoutablePlace | null = null;
    let bestScore = Infinity;
    for (const p of fromPool) {
      if (used.has(p.id)) continue;
      const straightKm = haversineKm(cursor.lat, cursor.lng, Number(p.lat), Number(p.lng));
      const walkKm = estimateWalkKm(straightKm);
      const popDiscount = popularityDistanceDiscountKm(p);
      const idealDiscount = ideal ? Math.max(0, (estimateStopFriendliness(p) - 70) / 10) * 0.5 : 0;
      const effectiveWalkKm = Math.max(0, walkKm - popDiscount - idealDiscount);
      const score =
        effectiveWalkKm > MAX_HOP_KM
          ? MAX_HOP_KM + effectiveWalkKm // 범위를 벗어날수록 더 불리하게, 하지만 후보 자체는 유지
          : Math.abs(effectiveWalkKm - TARGET_HOP_KM);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  };

  for (const role of roleSequence) {
    if (stops.length >= maxStops) break;
    const isCritical = CRITICAL_ROLES.includes(role);
    const roleCandidates = pool.filter((p) => classifyStopRole(p) === role);
    // 동물병원/동물약국은 후보가 없으면 다른 역할로 대충 채우지 않고 그냥 건너뜁니다 —
    // "동물약국"이라고 표시된 정거장이 실제로는 카페인 상황을 막기 위함입니다.
    if (isCritical && roleCandidates.length === 0) continue;
    const picked = pickBest(roleCandidates.length > 0 ? roleCandidates : pool, isCritical);
    if (!picked) continue;
    pushStop(picked, true);
  }

  // 정거장이 부족하면(role 후보가 겹쳐서 maxStops를 못 채운 경우) 남은 풀에서 채웁니다.
  // ⚠ 동물병원/동물약국은 위에서 이미 최대 1개씩만 뽑았으므로, 여기서는 아예 후보에서
  // 제외해서 "딱 한군데씩만"이 깨지지 않게 합니다.
  const fillerPool = pool.filter((p) => !CRITICAL_ROLES.includes(classifyStopRole(p)));
  while (stops.length < Math.min(maxStops, pool.length)) {
    const picked = pickBest(fillerPool, false);
    if (!picked) break;
    pushStop(picked, false);
  }

  // ⚠ 최종 안전장치: 위 로직상 동물병원/동물약국은 이미 최대 1개씩만 들어가야 하지만,
  // 데이터 소스마다 카테고리·이름 표기가 제각각이라 예기치 못한 경로로 중복이 들어갈
  // 가능성을 완전히 배제할 수 없어 마지막에 한 번 더 강제합니다 — critical role별로
  // 코스 순서상 가장 먼저 나온 1개만 남기고 나머지는 제거합니다.
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
