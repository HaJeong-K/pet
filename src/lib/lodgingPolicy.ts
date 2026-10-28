// src/lib/lodgingPolicy.ts
//
// 숙소 예약의 취소·환불·배상과 수수료·정산 규칙 — 「같이가개 숙소 입점 계약서」 제12~21조와 별표 1~3을 그대로 옮긴 것입니다.
//   · 환불: 공정위 「소비자분쟁해결기준」 숙박업 기준. 성수기 2일 전은 1일 전과 같게(주중 80%·주말 90%).
//   · 수수료: 기본 8%(숙소마다 입점일부터 3개월은 런칭 프로모션 5%), 숙소 프리미엄 5%, 위약금에는 취소 정산 수수료 15%.
//   · 이용 확정: 체크아웃 날부터 손님이 누르고, 3일 지나면 자동. 정산은 확정 다음 날(쉬는 날이면 다음 영업일).
// 화면과 서버가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다(lodgingPolicy.test.ts).

import { addDays, daysBetween } from "@/lib/lodgingBooking";
import { isBusinessDay, isHoliday } from "@/lib/koreanHolidays";

// ── 성수기·주말 ──

/** 성수기 기간("MM-DD" ~ "MM-DD", 해를 넘겨도 됨) */
export type PeakPeriod = { from: string; to: string };
/** 숙소가 성수기를 정하지 않으면 기준의 기본값 */
export const DEFAULT_PEAK_PERIODS: PeakPeriod[] = [{ from: "07-15", to: "08-24" }, { from: "12-20", to: "02-20" }];

export function isPeakDay(day: string, periods: PeakPeriod[] | null | undefined): boolean {
  const md = day.slice(5);
  const list = periods && periods.length > 0 ? periods : DEFAULT_PEAK_PERIODS;
  return list.some((p) => (p.from <= p.to ? md >= p.from && md <= p.to : md >= p.from || md <= p.to));
}
/** 주말 숙박 = 금·토요일 밤, 또는 다음 날이 공휴일인 밤 */
export function isWeekendStay(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6 || isHoliday(addDays(day, 1));
}

// ── 취소·환불·배상(별표 1·2) ──

export type CancelCause =
  | "guest"            // 손님 사정(단순 변심·노쇼 포함)
  | "guest_pet_mismatch" // 손님이 반려동물 정보를 다르게 적어 입실 거부 → 손님 사정 당일 취소
  | "owner"            // 숙소 사정(이중 예약·시설 문제)
  | "owner_pet_refused" // 정보가 맞는데 숙소가 입실 거부 → 숙소 사정
  | "force_majeure"    // 기상특보·행정명령
  | "not_confirmed";   // 확정 전 취소 — 손님이 확정 전에 취소, 숙소가 거절, 24시간 안에 확정하지 않음(계약 미성립 → 전액)

export const CANCEL_CAUSE_LABEL: Record<CancelCause, string> = {
  guest: "손님 사정 취소",
  guest_pet_mismatch: "반려동물 정보 불일치(손님)",
  owner: "숙소 사정 취소",
  owner_pet_refused: "반려동물 입실 거부(숙소)",
  force_majeure: "기상특보·행정명령",
  not_confirmed: "확정 전 취소",
};

type Bracket = { minDaysBefore: number; weekday: number | null; weekend: number | null };
/** 성수기: 위에서부터 "이용일 N일 전까지 취소" 구간. null = 기준에 비율이 없음(협의 필요) */
const PEAK_PENALTY: Bracket[] = [
  { minDaysBefore: 10, weekday: 0, weekend: 0 },
  { minDaysBefore: 7, weekday: 10, weekend: 20 },
  { minDaysBefore: 5, weekday: 30, weekend: 40 },
  { minDaysBefore: 3, weekday: 50, weekend: 60 },
  { minDaysBefore: -Infinity, weekday: 80, weekend: 90 },
];
const OFF_PENALTY: Bracket[] = [
  { minDaysBefore: 2, weekday: 0, weekend: 0 },
  { minDaysBefore: 1, weekday: 10, weekend: 20 },
  { minDaysBefore: -Infinity, weekday: 20, weekend: 30 },
];
/** 숙소 사정 취소 배상률(별표 2). 성수기 2일 전~당일은 계약서에서 아직 정하지 않음 → null(관리자가 정함) */
const PEAK_COMPENSATION: Bracket[] = [
  { minDaysBefore: 10, weekday: 0, weekend: 0 },
  { minDaysBefore: 7, weekday: 10, weekend: 20 },
  { minDaysBefore: 5, weekday: 30, weekend: 40 },
  { minDaysBefore: 3, weekday: 50, weekend: 60 },
  { minDaysBefore: -Infinity, weekday: null, weekend: null },
];

export type StayTiming = {
  checkIn: string;
  /** 예약한 날(한국 날짜) */
  bookedOn: string;
  /** 취소하는 날(한국 날짜) */
  cancelOn: string;
  peakPeriods?: PeakPeriod[] | null;
};

function pick(table: Bracket[], t: StayTiming): number | null {
  const daysBefore = daysBetween(t.cancelOn, t.checkIn);
  const row = table.find((b) => daysBefore >= b.minDaysBefore)!;
  return isWeekendStay(t.checkIn) ? row.weekend : row.weekday;
}

/** 손님 사정 취소의 공제율(%). 예약한 날 안에 취소하면 0 */
export function guestPenaltyRate(t: StayTiming): number {
  if (t.cancelOn === t.bookedOn) return 0;
  return pick(isPeakDay(t.checkIn, t.peakPeriods) ? PEAK_PENALTY : OFF_PENALTY, t) ?? 0;
}
/** 숙소 사정 취소의 배상률(%). null이면 기준에 비율이 없어 관리자가 정해야 함 */
export function ownerCompensationRate(t: StayTiming): number | null {
  if (isPeakDay(t.checkIn, t.peakPeriods)) return pick(PEAK_COMPENSATION, t);
  return pick(OFF_PENALTY, t);
}

export type CancelOutcome = {
  cause: CancelCause;
  /** 손님에게 돌려줄 금액(배상금 제외) */
  refund: number;
  /** 손님이 못 돌려받는 금액(숙소 몫) */
  penalty: number;
  /** 숙소가 손님에게 더 줄 배상금. null = 관리자 확인 필요 */
  compensation: number | null;
  rate: number | null;
};

const percentOf = (total: number, rate: number) => Math.floor((total * rate) / 100);

/** 취소 결과 — 원인과 시점에 따라 환불·위약금·배상금을 계산합니다 */
export function cancelOutcome(total: number, cause: CancelCause, t: StayTiming): CancelOutcome {
  if (cause === "guest" || cause === "guest_pet_mismatch") {
    const rate = cause === "guest_pet_mismatch" ? guestPenaltyRate({ ...t, cancelOn: t.checkIn, bookedOn: "" }) : guestPenaltyRate(t);
    const penalty = percentOf(total, rate);
    return { cause, refund: total - penalty, penalty, compensation: 0, rate };
  }
  if (cause === "owner" || cause === "owner_pet_refused") {
    const rate = ownerCompensationRate(cause === "owner_pet_refused" ? { ...t, cancelOn: t.checkIn } : t);
    return { cause, refund: total, penalty: 0, compensation: rate == null ? null : percentOf(total, rate), rate };
  }
  return { cause, refund: total, penalty: 0, compensation: 0, rate: 0 };
}

/** 결제 전에 보여 줄 날짜별 환불 안내 — "이날까지 취소하면 얼마 돌려받는지" */
export function refundSchedule(total: number, checkIn: string, bookedOn: string, peakPeriods?: PeakPeriod[] | null): { until: string; refund: number; rate: number }[] {
  const rows: { until: string; refund: number; rate: number }[] = [];
  let last = -1;
  for (let d = daysBetween(bookedOn, checkIn); d >= 0; d--) {
    const cancelOn = addDays(checkIn, -d);
    const rate = guestPenaltyRate({ checkIn, bookedOn, cancelOn, peakPeriods });
    if (rate !== last) {
      rows.push({ until: cancelOn, refund: total - percentOf(total, rate), rate });
      last = rate;
    } else rows[rows.length - 1].until = cancelOn;
  }
  return rows;
}

// ── 수수료·정산(별표 3) ──

/** 숙소 입점 계약서 판 — 사장님이 입점 신청 때 동의한 판을 기록합니다(내용이 바뀌면 날짜를 올림) */
export const LODGING_CONTRACT_VERSION = "2026-10-28";
/** 런칭 프로모션 — 숙소마다 입점일(lodging_partners.partner_since)부터 이 개월 수 동안 체크인하는 예약은 5% */
export const PROMO_MONTHS = 3;
export const BASIC_FEE_RATE = 8;
export const PROMO_FEE_RATE = 5;
export const PREMIUM_FEE_RATE = 5;
export const CANCEL_FEE_RATE = 15;
export const AUTO_CONFIRM_DAYS = 3;

/** 같은 날짜의 n개월 뒤(그달에 그날이 없으면 그달 마지막 날) — "2026-11-30" + 3 → "2027-02-28" */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
/** 런칭 프로모션 마지막 날(입점일 + 3개월 − 1일) */
export const promoLastDay = (partnerSince: string) => addDays(addMonths(partnerSince, PROMO_MONTHS), -1);

/** 이용 확정된 예약의 수수료율 — 프리미엄이면 5%, 아니면 입점일부터 3개월 안에 체크인한 예약 5%, 이후 8% */
export function stayFeeRate(checkIn: string, premium: boolean, partnerSince: string | null): number {
  if (premium) return PREMIUM_FEE_RATE;
  return partnerSince && checkIn >= partnerSince && checkIn <= promoLastDay(partnerSince) ? PROMO_FEE_RATE : BASIC_FEE_RATE;
}
export function settle(amount: number, rate: number): { fee: number; payout: number } {
  const fee = Math.round((amount * rate) / 100);
  return { fee, payout: amount - fee };
}

/** 이용 확정 버튼이 열리는 날 = 체크아웃 날 / 자동 확정 날 = 체크아웃 + 3일 */
export const confirmOpensOn = (checkOut: string) => checkOut;
export const autoConfirmOn = (checkOut: string) => addDays(checkOut, AUTO_CONFIRM_DAYS);
/** 그날 다음 날부터 첫 영업일(정산일) */
export function nextBusinessDayAfter(day: string): string {
  let d = addDays(day, 1);
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}
