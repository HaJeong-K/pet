// 회원 이용 제재 기준 — 2026-11-13 (대표 확정 전 제안값: 숫자는 여기만 고치면 화면·안내·서버가 함께 바뀝니다)
//   · 운영진이 "위반"으로 확인한 횟수(신고 횟수 자체가 아님 — 허위·보복 신고로 제재되지 않게)에 따라 단계가 올라갑니다.
//   · 최근 1년 안의 위반만 셉니다. 이의가 받아들여져 해제된 기록은 세지 않습니다.
//   · 중대한 위반은 횟수와 상관없이 바로 영구 정지.
// 제한 내용: 커뮤니티 글·댓글, 장소 후기·답글, 숙박·가게 후기 쓰기(읽기·예약·주문은 그대로).

export type SanctionStage = "warning" | "suspend" | "ban";
export type SanctionStep = { stage: SanctionStage; days: number | null; label: string };

/** n번째 위반(1부터) → 조치 */
export const SANCTION_STEPS: SanctionStep[] = [
  { stage: "warning", days: null, label: "경고" },
  { stage: "suspend", days: 7, label: "7일 작성 제한" },
  { stage: "suspend", days: 30, label: "30일 작성 제한" },
  { stage: "ban", days: null, label: "영구 정지" },
];
/** 위반을 세는 기간(일) */
export const STRIKE_WINDOW_DAYS = 365;
/** 같은 글을 서로 다른 회원 몇 명이 신고하면 확인 전까지 가리는지(scripts/sql/member-sanctions.sql의 숫자와 같아야 함) */
export const AUTO_HOLD_REPORTERS = 5;
/** 이의 제기 기간(일) */
export const APPEAL_DAYS = 7;
/** 바로 영구 정지하는 중대한 위반 */
export const SEVERE_VIOLATIONS = [
  "불법 촬영물, 아동·청소년 성착취물 등 불법 정보 게시",
  "동물 학대 행위 또는 학대를 부추기는 내용",
  "사기, 금전 요구, 불법 거래(무허가 동물 판매 포함)",
  "다른 사람의 개인정보 유포, 스토킹, 협박",
  "제재를 피하려고 다른 계정으로 다시 가입해 같은 위반을 반복",
];

/** 지금까지의 위반 횟수(최근 1년, 해제 제외) → 이번에 적용할 조치 */
export function nextSanction(priorStrikes: number, severe = false): SanctionStep {
  if (severe) return SANCTION_STEPS[SANCTION_STEPS.length - 1];
  const i = Math.min(Math.max(0, Math.floor(priorStrikes)), SANCTION_STEPS.length - 1);
  return SANCTION_STEPS[i];
}

export type SanctionRow = { stage: SanctionStage; ends_at: string | null; lifted_at: string | null; created_at: string };

/** 위반 횟수로 세는 기록인지(해제되지 않았고 기간 안) */
export function countsAsStrike(row: SanctionRow, now = Date.now()): boolean {
  return !row.lifted_at && now - new Date(row.created_at).getTime() <= STRIKE_WINDOW_DAYS * 86_400_000;
}
/** 지금 작성이 막혀 있는 기록인지 */
export function isBlocking(row: SanctionRow, now = Date.now()): boolean {
  if (row.lifted_at) return false;
  if (row.stage === "ban") return true;
  return row.stage === "suspend" && !!row.ends_at && new Date(row.ends_at).getTime() > now;
}
