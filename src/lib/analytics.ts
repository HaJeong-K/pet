"use client";

// ── 클라이언트 이벤트 트래커 ──
// 관리자 통계 분석 탭(/admin/analytics)에서 볼 방문자 추이·재방문율·검색어 추이·
// 지역별 인기 장소를 계산하려면 실제 이용 이벤트가 쌓여 있어야 합니다. 이 파일은
// 그 이벤트를 /api/analytics/track으로 보내는 가벼운 헬퍼입니다.
// - 실패해도 화면 동작에 영향 없도록 항상 fire-and-forget(await하지 않음, 에러 무시)입니다.
// - user_key: 비로그인 사용자도 구분할 수 있도록 기존에 쓰던 localStorage user_key를 재사용합니다.

export const getUserKey = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let key = localStorage.getItem("user_key");
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem("user_key", key);
    }
    return key;
  } catch {
    return "";
  }
};

// ── 추천 시스템 측정용 이벤트 ──
// rec_impression    : 추천 장소 패널에 Top N 목록이 노출됨 (meta.items = [{id, pos, score}])
// rec_click         : 추천 목록의 장소 클릭 (meta.pos = 노출 위치 — 위치 편향 보정용)
// course_impression : AI 코스가 노출됨 (meta.stops, meta.theme)
// course_regenerate : "다른 코스 보기" 클릭 — 코스 불만족의 간접 지표
// course_stop_click : 코스 정거장 클릭
// course_start      : 카카오맵/네이버 길찾기로 코스 출발 — 코스 수락 지표
// 모든 추천 이벤트는 variant(A/B 그룹)와 meta.algo(알고리즘 버전)를 함께 남겨서
// /admin/analytics의 "추천 성과" 섹션에서 그룹별로 비교합니다.
export type AnalyticsEventType =
  | "page_view"
  | "search"
  | "place_view"
  | "rec_impression"
  | "rec_click"
  | "course_impression"
  | "course_regenerate"
  | "course_stop_click"
  | "course_start";

export function trackEvent(
  type: AnalyticsEventType,
  payload: {
    path?: string;
    query?: string;
    placeId?: string | number;
    placeName?: string;
    region?: string;
    subRegion?: string;
    authUserId?: string | null;
    variant?: string | null;
    meta?: Record<string, unknown> | null;
  } = {}
) {
  try {
    const body = JSON.stringify({
      eventType: type,
      userKey: getUserKey(),
      authUserId: payload.authUserId ?? null,
      path: payload.path ?? null,
      query: payload.query ?? null,
      placeId: payload.placeId != null ? String(payload.placeId) : null,
      placeName: payload.placeName ?? null,
      region: payload.region ?? null,
      subRegion: payload.subRegion ?? null,
      variant: payload.variant ?? null,
      meta: payload.meta ?? null,
    });

    // sendBeacon은 페이지 이탈 중에도 안전하게 전송되고 응답을 기다리지 않아 가장 가볍습니다.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 통계 수집 실패가 사용자 경험에 영향을 주면 안 되므로 조용히 무시합니다 */
  }
}

// 주소 문자열에서 시도 단위를 뽑아 지역별 통계에 씁니다. 예: "경상남도 거창군 ..." → "경남"
const SIDO_ALIASES: [RegExp, string][] = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"],
  [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"],
  [/^충청남|^충남/, "충남"], [/^전북|^전라북/, "전북"], [/^전남|^전라남/, "전남"],
  [/^경북|^경상북/, "경북"], [/^경남|^경상남/, "경남"], [/^제주/, "제주"],
];

export function extractRegion(address: string | null | undefined): string {
  if (!address) return "기타";
  const trimmed = address.trim();
  for (const [re, label] of SIDO_ALIASES) {
    if (re.test(trimmed)) return label;
  }
  return "기타";
}

// 주소의 두 번째 토큰(시군구)을 뽑습니다. 한국 주소는 "시도 시군구 ..." 순서라
// 두 번째 공백 구분 토큰이 대체로 시/군/구 단위입니다. 예: "경상남도 거창군 신원면..." → "거창군"
export function extractSubRegion(address: string | null | undefined): string {
  if (!address) return "기타";
  const parts = address.trim().split(/\s+/);
  return parts[1] || "기타";
}
