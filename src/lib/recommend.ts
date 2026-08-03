// src/lib/recommend.ts
//
// 위치 기반 개인화 맞춤 추천 — Content-Based Filtering
//
// 신청서 1.2)-④ "위치 기반 개인화 맞춤 추천" 항목의 실제 구현입니다.
// 사용자의 현재 위치(거리), 선택한 선호 필터 일치 여부, 편의시설(대형견/펫메뉴),
// 신규 등록 여부를 종합해 정렬 우선순위 점수를 계산합니다.
//
// 협업 필터링(Item2Vec)은 사용자별 행동 로그가 충분히 쌓인 뒤 별도 배치 파이프라인으로
// 고도화할 부분이라, 현재 단계에서는 특성 기반(Content-Based) 스코어링으로 구현했습니다.
//
// ── 다음 단계: 공원 데이터 반영 (조사 완료, 연동은 추후)
// 행정안전부 "전국도시공원정보표준데이터"(data.go.kr/data/15012890/standard.do)에
// 전국 19,199개 도시공원의 위치·시설 정보가 지자체 매월 갱신 표준 포맷으로 제공됩니다.
// 산책 동선 추천에 반영하려면: (1) 공원 좌표를 장소 데이터와 같은 방식으로 지도에 통합하고,
// (2) calculateRecommendScore에 "가장 가까운 공원까지의 거리" 항목을 가중치로 추가해
// 산책 겸 방문에 유리한 장소가 상위로 오도록 확장하면 됩니다.

export interface RecommendInput {
  distanceKm: number | null;
  matchesSelectedFilter: boolean;
  largeDog?: boolean | null;
  petMenu?: string | null;
  createdAt?: string | null;
}

const NEW_PLACE_WINDOW_DAYS = 14;

export function calculateRecommendScore(input: RecommendInput): number {
  let score = 100;

  // 거리 페널티: 1km당 -6점 (최대 -60). 거리 정보가 없으면 페널티 없음(검색 결과 등).
  if (input.distanceKm != null && !Number.isNaN(input.distanceKm)) {
    score -= Math.min(60, input.distanceKm * 6);
  }

  if (input.matchesSelectedFilter) score += 15;
  if (input.largeDog) score += 8;
  if (input.petMenu && input.petMenu !== "정보없음") score += 7;

  if (input.createdAt) {
    const days = (Date.now() - new Date(input.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0 && days <= NEW_PLACE_WINDOW_DAYS) {
      score += Math.max(0, 10 - days * (10 / NEW_PLACE_WINDOW_DAYS));
    }
  }

  return Math.round(score);
}
