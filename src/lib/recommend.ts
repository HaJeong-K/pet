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

import { RECOMMEND_WEIGHTS } from "@/lib/scoringConfig";

export interface RecommendInput {
  /** 기준 위치(내 위치 또는 검색 중심)로부터의 거리(km). 검색 결과 등 거리 개념이 없으면 null */
  distanceKm: number | null;
  /** 사용자가 현재 선택한 선호 필터(실내/야외/동물병원/동물약국 등)와 일치하는지 */
  matchesSelectedFilter: boolean;
  largeDog?: boolean | null;
  /** 장소 등록 시각(ISO 문자열). 공공데이터 출처처럼 등록일을 알 수 없으면 null/undefined로 전달 */
  createdAt?: string | null;
}

export interface RecommendBreakdown {
  distancePenalty: number;
  filterBonus: number;
  largeDogBonus: number;
  newPlaceBonus: number;
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
  RECOMMEND_WEIGHTS.NEW_PLACE_BONUS_MAX;

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

  const raw = RECOMMEND_WEIGHTS.BASE_SCORE - dPenalty + filterBonus + largeDogBonus + nBonus;
  const total = normalizeTo100(raw);

  return {
    distancePenalty: Math.round(dPenalty),
    filterBonus,
    largeDogBonus,
    newPlaceBonus: Math.round(nBonus),
    total,
  };
}

export function calculateRecommendScore(input: RecommendInput): number {
  return calculateRecommendBreakdown(input).total;
}
