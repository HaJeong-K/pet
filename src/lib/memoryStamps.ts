// src/lib/memoryStamps.ts
//
// 추억 스탬프 규칙(브라우저·서버 공용). 장소에 다녀온 인증, 코스 완주, 숙박 이용 완료로 받고, 숙소 예약 때 할인으로 씁니다.
// 숫자는 이 파일만 고치면 바뀝니다. ⚠ 스탬프 값·할인 한도는 임시로 정한 값입니다(대표 확인 전).
// 현금으로 바꿀 수 없고, 할인분은 같이가개가 부담합니다(숙소 정산은 할인 전 금액 기준 — lodgingMoney.ts).

/**
 * ⚠ 추억 스탬프 전체 스위치 — 구조를 대표가 다시 정하는 동안 꺼 둡니다(docs/pending-stamp-packaging-idea.md).
 * false면 받기·모아 보기·예약 할인·숙박 완료 지급·개인정보 처리방침 문구가 모두 빠지고, 서버도 받지 않습니다.
 */
export const STAMPS_ENABLED = false;

/** 스탬프 1개의 할인액(원) */
export const STAMP_VALUE_WON = 100;
/** 예약 금액의 이 비율까지만 스탬프로 할인 */
export const STAMP_MAX_RATE = 0.1;
/** 장소에서 이 거리(m) 안이면 다녀온 것으로 인정 */
export const STAMP_RADIUS_M = 300;
/** GPS 오차를 이만큼(m)까지만 봐 줍니다 */
export const STAMP_ACCURACY_ALLOW_M = 100;
/** 같은 장소는 이 기간(일)에 한 번만 */
export const STAMP_PLACE_COOLDOWN_DAYS = 30;
/** 하루에 받을 수 있는 장소 스탬프 수 */
export const STAMPS_PER_DAY = 5;

/** 예약 금액에서 쓸 수 있는 최대 스탬프 수 */
export function maxUsableStamps(total: number, available: number): number {
  if (!(total > 0) || !(available > 0)) return 0;
  return Math.min(Math.floor(available), Math.floor((total * STAMP_MAX_RATE) / STAMP_VALUE_WON));
}

/** 스탬프 사용 금액 — 쓸 수 있는 만큼으로 줄여서 계산합니다 */
export function stampDiscount(total: number, wanted: number, available: number): { used: number; discount: number } {
  const want = Number.isInteger(wanted) && wanted > 0 ? wanted : 0;
  const used = Math.min(want, maxUsableStamps(total, available));
  return { used, discount: used * STAMP_VALUE_WON };
}

/** 장소까지의 거리·GPS 오차로 다녀온 것을 인정할지 */
export function stampInRange(distanceM: number, accuracyM: number | null | undefined): boolean {
  const allow = Math.min(Math.max(accuracyM ?? 0, 0), STAMP_ACCURACY_ALLOW_M);
  return distanceM <= STAMP_RADIUS_M + allow;
}

/** 코스 완주 여부 — 장소가 2곳 이상이고 모두 스탬프가 있어야 합니다 */
export function courseCompleted(stopIds: string[], stampedKeys: Set<string>): boolean {
  return stopIds.length >= 2 && stopIds.every((id) => stampedKeys.has(String(id)));
}

export type StampKind = "place" | "course" | "stay";
export const STAMP_KIND_LABEL: Record<StampKind, string> = { place: "다녀온 곳", course: "코스 완주", stay: "숙박 완료" };
