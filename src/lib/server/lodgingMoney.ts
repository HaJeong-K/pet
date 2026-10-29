// src/lib/server/lodgingMoney.ts
//
// 숙박 예약의 돈 흐름(서버 전용) — 취소 환불·위약금·배상, 이용 확정, 정산 금액을 계산해 예약에 적습니다.
// 규칙은 src/lib/lodgingPolicy.ts(계약서 제12~21조), 표는 scripts/sql/lodging-settlement.sql.
//
// 결제대행(PG) 연동 전에는 실제로 돈이 오가지 않습니다 — 금액은 계산해 적어 두고, 결제가 확인된 예약(payment_status = 'paid')만
// 정산 예정(payout_status = 'scheduled')이 됩니다. 연동 후에는 여기서 결제 취소·지급 요청을 함께 부르면 됩니다.

import { db, activePlanOf } from "@/lib/server/ownerStore";
import { BOOKING_FULL_COLUMNS, partnerOf } from "@/lib/server/lodgingStore";
import { kstToday, type StayStatus } from "@/lib/lodgingBooking";
import {
  CANCEL_FEE_RATE, cancelOutcome, nextBusinessDayAfter, settle, stayFeeRate, type CancelCause, type PeakPeriod,
} from "@/lib/lodgingPolicy";
import { notifyStayGuest, runGuestStayNotices } from "@/lib/server/guestNotify";
import { syncAllRoomIcal } from "@/lib/server/lodgingIcal";

export const NEED_SETTLEMENT_SQL = "예약 정산 기능을 준비하고 있어요. Supabase SQL 편집기에서 scripts/sql/lodging-settlement.sql을 실행해 주세요.";

export type MoneyBooking = {
  id: number; place_id: number; check_in: string; check_out: string; total: number; status: StayStatus;
  booked_on: string | null; created_at: string; payment_status: string;
};

async function peakPeriodsOf(placeId: number): Promise<PeakPeriod[] | null> {
  const { data } = await db.from("lodging_profiles").select("peak_periods").eq("place_id", placeId).maybeSingle();
  return Array.isArray(data?.peak_periods) ? (data!.peak_periods as PeakPeriod[]) : null;
}

const bookedOnOf = (b: MoneyBooking) => b.booked_on ?? kstToday(new Date(b.created_at).getTime());

/**
 * 예약을 취소하고 환불·위약금·배상·정산을 적습니다. 바뀐 예약을 돌려줍니다.
 *   · 손님 사정: 공제율만큼 위약금(숙소 몫) → 취소 정산 수수료 15%를 뺀 금액을 원래 체크아웃 다음 영업일에 정산
 *   · 숙소 사정: 손님 전액 환불 + 배상금. 배상금은 숙소의 다음 정산에서 뺍니다(정산 금액이 음수로 남음)
 *   · 불가항력·미확정: 전액 환불, 수수료·배상 없음
 * fromStatus가 지금 상태와 다르면(그 사이 바뀜) null을 돌려줍니다.
 */
export async function applyCancel(b: MoneyBooking, cause: CancelCause, nextStatus: StayStatus, fromStatus: StayStatus, extra: Record<string, unknown> = {}) {
  const today = kstToday();
  const out = cancelOutcome(b.total, cause, { checkIn: b.check_in, bookedOn: bookedOnOf(b), cancelOn: today, peakPeriods: await peakPeriodsOf(b.place_id) });
  const paid = b.payment_status === "paid";
  let money: Record<string, unknown> = { fee_rate: 0, fee_amount: 0, payout_amount: 0, payout_due_on: null, payout_status: "none" };
  if (out.penalty > 0) {
    const s = settle(out.penalty, CANCEL_FEE_RATE);
    money = { fee_rate: CANCEL_FEE_RATE, fee_amount: s.fee, payout_amount: s.payout, payout_due_on: nextBusinessDayAfter(b.check_out < today ? today : b.check_out), payout_status: paid ? "scheduled" : "none" };
  } else if (out.compensation && out.compensation > 0) {
    money = { fee_rate: 0, fee_amount: 0, payout_amount: -out.compensation, payout_due_on: nextBusinessDayAfter(today), payout_status: paid ? "scheduled" : "none" };
  }
  const now = new Date().toISOString();
  const { data, error } = await db.from("lodging_bookings").update({
    status: nextStatus, cancel_cause: cause, cancelled_at: now, updated_at: now,
    refund_amount: out.refund, penalty_amount: out.penalty, compensation_amount: out.compensation,
    payment_status: paid ? (out.refund >= b.total ? "refunded" : out.refund > 0 ? "partially_refunded" : "paid") : b.payment_status,
    ...money, ...extra,
  }).eq("id", b.id).eq("status", fromStatus).select(BOOKING_FULL_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { booking: data, outcome: out } : null;
}

/** 이용 확정 — 수수료(프리미엄 5% / 입점 후 3개월 5% / 기본 8%)를 계산하고 다음 영업일 정산으로 잡습니다 */
export async function confirmStay(b: MoneyBooking, by: "guest" | "auto" | "admin") {
  const [plan, partner] = await Promise.all([activePlanOf(b.place_id), partnerOf(b.place_id)]);
  const rate = stayFeeRate(b.check_in, plan != null, partner.partnerSince);
  const s = settle(b.total, rate);
  const now = new Date().toISOString();
  const { data, error } = await db.from("lodging_bookings").update({
    status: "completed", stay_confirmed_at: now, stay_confirmed_by: by, updated_at: now,
    fee_rate: rate, fee_amount: s.fee, payout_amount: s.payout, payout_due_on: nextBusinessDayAfter(kstToday()),
    payout_status: b.payment_status === "paid" ? "scheduled" : "none",
  }).eq("id", b.id).eq("status", "confirmed").select(BOOKING_FULL_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const MONEY_COLUMNS = "id, place_id, check_in, check_out, total, status, booked_on, created_at, payment_status";

/**
 * 매일 새벽 작업(src/app/api/cron/daily):
 *   1) 체크아웃 날부터 3일 지난 확정 예약 중 문제 접수가 없는 것 → 자동 이용 확정
 *   2) 24시간 안에 숙소가 확정하지 않은 예약 요청 → 자동 취소(전액 환불)
 */
export async function runLodgingDaily() {
  const today = kstToday();
  const autoBefore = new Date(`${today}T00:00:00Z`).getTime() - 3 * 86_400_000;
  const confirmDay = new Date(autoBefore).toISOString().slice(0, 10);
  const { data: due, error } = await db.from("lodging_bookings").select(MONEY_COLUMNS)
    .eq("status", "confirmed").is("stay_confirmed_at", null).neq("issue_status", "open").lte("check_out", confirmDay).limit(500);
  if (error) throw new Error(error.message);
  let confirmed = 0;
  for (const b of (due ?? []) as MoneyBooking[]) if (await confirmStay(b, "auto")) confirmed++;

  const { data: stale } = await db.from("lodging_bookings").select(MONEY_COLUMNS)
    .eq("status", "requested").lt("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()).limit(500);
  let expired = 0;
  for (const b of (stale ?? []) as MoneyBooking[]) {
    if (await applyCancel(b, "not_confirmed", "declined", "requested", { owner_note: "숙소가 24시간 안에 확정하지 않아 자동 취소" })) {
      expired++;
      await notifyStayGuest(Number(b.id), "expired");
    }
  }
  // 손님 알림: 내일 체크인 안내 · 체크아웃 후 후기 요청(한 번씩)
  const notices = await runGuestStayNotices(today).catch((e) => ({ reminded: 0, reviewAsked: 0, skipped: e instanceof Error ? e.message : "실패" }));
  // 다른 예약 사이트 달력(iCal)에서 팔린 날 가져오기
  const ical = await syncAllRoomIcal().catch((e) => ({ synced: 0, failed: 0, skipped: e instanceof Error ? e.message : "실패" }));
  return { autoConfirmed: confirmed, expiredRequests: expired, ...notices, ical };
}

export { MONEY_COLUMNS };
