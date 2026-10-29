import { NextRequest, NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { BOOKING_FULL_COLUMNS } from "@/lib/server/lodgingStore";
import { applyCancel, confirmStay, MONEY_COLUMNS, NEED_SETTLEMENT_SQL, type MoneyBooking } from "@/lib/server/lodgingMoney";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { notifyGuest } from "@/lib/server/guestNotify";

// 관리자 전용: 숙박 예약 관리(「같이가개 숙소 입점 계약서」 제11·14·20조)
//   GET ?view=issues | payouts | refunds | all  → 문제 접수 / 정산 예정 / 환불 처리 대기 / 최근 예약 + 숙소 이름
//   POST { id, action, ... }
//     "resolve"        { decision, note } : 문제 접수 판단
//         stay_ok         → 정상 이용으로 보고 이용 확정(정산 진행)
//         owner_refused   → 숙소 사정(입실 거부 등): 손님 전액 환불 + 배상
//         guest_mismatch  → 손님이 반려동물 정보를 다르게 적음: 손님 사정 당일 취소
//     "compensation"   { amount } : 기준에 배상률이 없는 구간(성수기 2일 전~당일)의 배상금을 정함
//     "mark_paid"                 : 결제 확인(결제대행 연동 전 임시) — 이 뒤로 정산이 잡힙니다
//     "mark_paid_out"             : 숙소 계좌로 보냄(결제대행 연동 전 임시, 직접 이체한 뒤 누름)
//     "mark_refunded"             : 손님에게 환불을 보냄(결제대행 연동 전 임시, 직접 돌려준 뒤 누름) — 처리한 관리자·시각을 남기고 손님에게 알림

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const view = req.nextUrl.searchParams.get("view") ?? "issues";
  const query = (extra: string) => {
    let q = db.from("lodging_bookings").select(`${BOOKING_FULL_COLUMNS}, guest_auth_user_id${extra}`).order("created_at", { ascending: false }).limit(300);
    if (view === "issues") q = q.or("issue_status.eq.open,compensation_amount.is.null");
    else if (view === "payouts") q = q.in("payout_status", ["scheduled", "held"]);
    // 환불 처리 대기: 결제를 받은 뒤 취소돼 돌려줄 돈이 있는데 아직 보냈다고 표시하지 않은 것
    else if (view === "refunds") q = q.gt("refund_amount", 0).not("paid_at", "is", null).is("refund_done_at", null);
    return q;
  };
  let { data, error } = await query(", refund_done_at, refund_done_by");
  // 환불 기록 칸(scripts/sql/lodging-operations.sql) 실행 전이면 그 칸 없이(환불 처리 목록은 빈 채로)
  if (error && isMissingSchema(error) && view !== "refunds") ({ data, error } = await query("") as never);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, bookings: [] }) : fail(error.message, 500);
  const rows = (data ?? []) as Record<string, any>[];
  const ids = [...new Set(rows.map((b) => Number(b.place_id)))];
  const { data: places } = ids.length ? await db.from("places").select("id, name").in("id", ids) : { data: [] as any[] };
  return NextResponse.json({
    ready: true,
    bookings: rows
      // "배상금 미정"은 숙소 사정 취소인데 배상금이 비어 있는 것만
      .filter((b) => view !== "issues" || b.issue_status === "open" || (b.compensation_amount == null && (b.cancel_cause === "owner" || b.cancel_cause === "owner_pet_refused")))
      .map(({ guest_auth_user_id: _hidden, ...b }) => ({ ...b, placeName: (places ?? []).find((p) => Number(p.id) === Number(b.place_id))?.name ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("관리자 권한 없음", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);
  const { data: found, error: findError } = await db.from("lodging_bookings").select(`${MONEY_COLUMNS}, issue_status, compensation_amount, payout_status, room_name, guest_name`).eq("id", id).maybeSingle();
  if (findError) return fail(isMissingSchema(findError) ? NEED_SETTLEMENT_SQL : findError.message, 500);
  if (!found) return fail("예약을 찾을 수 없어요.", 404);
  const b = found as MoneyBooking & { issue_status: string; compensation_amount: number | null; payout_status: string; room_name: string; guest_name: string };
  const now = new Date().toISOString();
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 600) : "";

  try {
    if (body?.action === "resolve") {
      if (b.issue_status !== "open") return fail("처리 중인 문제 접수가 아니에요.", 409);
      const resolved = { issue_status: "resolved", issue_resolution: note || null };
      let result: unknown = null;
      if (body.decision === "stay_ok") {
        await db.from("lodging_bookings").update({ ...resolved, updated_at: now }).eq("id", id);
        result = await confirmStay({ ...b }, "admin");
      } else if (body.decision === "owner_refused") {
        result = await applyCancel(b, "owner_pet_refused", "cancelled_by_owner", "confirmed", resolved);
      } else if (body.decision === "guest_mismatch") {
        result = await applyCancel(b, "guest_pet_mismatch", "cancelled_by_guest", "confirmed", resolved);
      } else return fail("판단을 골라 주세요.", 400);
      if (!result) return fail("그 사이 예약 상태가 바뀌었어요. 새로 고쳐 주세요.", 409);
      after(() => sendOwnerPush(b.place_id, { title: "문제 접수 처리 결과", body: `${b.guest_name}님 · ${b.room_name}\n${note || "관리자가 처리했어요."}`, tag: `ggk-stay-${id}`, url: "/owner#stays" }));
    } else if (body?.action === "compensation") {
      const amount = Math.round(Number(body.amount));
      if (!Number.isFinite(amount) || amount < 0 || amount > b.total) return fail("배상금은 0원부터 결제 금액까지 적을 수 있어요.", 400);
      await db.from("lodging_bookings").update({ compensation_amount: amount, payout_amount: -amount, updated_at: now }).eq("id", id);
    } else if (body?.action === "mark_paid") {
      if (b.payment_status !== "unpaid") return fail("결제 대기 중인 예약이 아니에요.", 409);
      // 이미 이용 확정·취소된 예약이면 계산해 둔 정산을 바로 잡습니다.
      const { data: money } = await db.from("lodging_bookings").select("payout_amount").eq("id", id).maybeSingle();
      const settled = b.status !== "requested" && b.status !== "confirmed" && Number(money?.payout_amount ?? 0) !== 0;
      await db.from("lodging_bookings").update({ payment_status: "paid", paid_at: now, updated_at: now, ...(settled ? { payout_status: "scheduled" } : {}) }).eq("id", id);
    } else if (body?.action === "mark_paid_out") {
      if (b.payout_status !== "scheduled") return fail("정산 예정인 예약이 아니에요.", 409);
      await db.from("lodging_bookings").update({ payout_status: "paid", paid_out_at: now, updated_at: now }).eq("id", id);
    } else if (body?.action === "mark_refunded") {
      const { data: refund, error: refundError } = await db.from("lodging_bookings").select("refund_amount, paid_at, refund_done_at, guest_auth_user_id").eq("id", id).maybeSingle();
      if (refundError) return fail(isMissingSchema(refundError) ? "환불 기록은 준비 중이에요(lodging-operations.sql 실행 필요)." : refundError.message, 500);
      if (!refund || Number(refund.refund_amount) <= 0 || !refund.paid_at) return fail("돌려줄 금액이 있는 예약이 아니에요.", 409);
      if (refund.refund_done_at) return fail("이미 환불을 보냈다고 표시한 예약이에요.", 409);
      await db.from("lodging_bookings").update({ refund_done_at: now, refund_done_by: admin.email || admin.id, updated_at: now }).eq("id", id);
      const amount = Number(refund.refund_amount).toLocaleString("ko-KR");
      after(() => notifyGuest(refund.guest_auth_user_id, { kind: "stay_refunded", title: "환불을 보냈어요", body: `${b.room_name} 예약 ${amount}원을 돌려드렸어요. 카드·계좌에 따라 며칠 걸릴 수 있어요.`, url: "/mypage#stays" }));
    } else return fail("요청이 올바르지 않아요.", 400);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "처리하지 못했어요.", 500);
  }
  const { data } = await db.from("lodging_bookings").select(BOOKING_FULL_COLUMNS).eq("id", id).maybeSingle();
  return NextResponse.json({ booking: data });
}
