import { canReportViolation, OWNER_VIOLATION_KINDS } from "@/lib/lodgingPolicy";
import { notifyGuest } from "@/lib/server/guestNotify";
import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { BOOKING_COLUMNS, BOOKING_FULL_COLUMNS, GUEST_INFO_COLUMNS, confirmedOverlaps, lodgingOwnerContext } from "@/lib/server/lodgingStore";
import { applyCancel, MONEY_COLUMNS, NEED_SETTLEMENT_SQL, type MoneyBooking } from "@/lib/server/lodgingMoney";
import { notifyAdmin } from "@/lib/server/notify";
import { notifyStayGuest } from "@/lib/server/guestNotify";
import { canChangeStay, kstToday, type StayStatus } from "@/lib/lodgingBooking";
import { won } from "@/lib/ownerPlans";

// 숙소 사장님의 숙박 예약 관리(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId= 로 지정한 숙소) — 계약서 제8·13·14·20조
//   GET   → 최근 예약 목록(손님 이름·전화·정산 금액 포함 — 그 숙소의 사장님과 관리자만 볼 수 있음)
//           ?count=1 이면 확인을 기다리는 예약 + 의견을 기다리는 문제 접수 수(알림 숫자용)
//   PATCH → { id, status, ownerNote }
//             확인 대기 → 확정 / 거절(전액 환불)
//             확정 → 노쇼(체크인 날부터, 당일 취소 위약금) / 숙소 사정으로 취소(전액 환불 + 배상, 배상금은 다음 정산에서 차감)
//           { id, issueReply } → 손님이 접수한 문제에 대한 사장님 의견(3영업일 안)
// 이용 완료는 손님의 이용 확정(또는 체크아웃 3일 뒤 자동 확정)으로만 됩니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const LIST_LIMIT = 300;

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (req.nextUrl.searchParams.get("count")) {
    const [requested, issues] = await Promise.all([
      db.from("lodging_bookings").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("status", "requested"),
      db.from("lodging_bookings").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("issue_status", "open").is("issue_owner_reply", null),
    ]);
    // 표가 아직 없거나 세지 못하면 0으로(알림 숫자가 화면을 막으면 안 됩니다)
    return NextResponse.json({ waiting: (requested.error ? 0 : requested.count ?? 0) + (issues.error ? 0 : issues.count ?? 0) });
  }
  let settlementReady = true;
  let { data, error } = await db.from("lodging_bookings").select(`${BOOKING_FULL_COLUMNS}, ${GUEST_INFO_COLUMNS}`)
    .eq("place_id", ctx.placeId).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  // 이용자 정보 칸이 아직 없으면 그 칸 없이
  if (error && isMissingSchema(error)) ({ data, error } = await db.from("lodging_bookings").select(BOOKING_FULL_COLUMNS).eq("place_id", ctx.placeId).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(LIST_LIMIT) as never);
  if (error && isMissingSchema(error)) {
    settlementReady = false;
    ({ data, error } = await db.from("lodging_bookings").select(BOOKING_COLUMNS).eq("place_id", ctx.placeId).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(LIST_LIMIT) as never);
  }
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, bookings: [] });
    return fail(error.message, 500);
  }
  return NextResponse.json({ ready: true, settlementReady, today: kstToday(), bookings: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);
  const ownerNote = typeof body?.ownerNote === "string" && body.ownerNote.trim() ? body.ownerNote.trim().slice(0, 200) : null;
  const now = new Date().toISOString();

  // 손님의 규정 위반 접수 — 숙소가 혼자 처리하지 않고 같이가개가 양쪽을 확인합니다. 접수하면 정산이 멈춥니다.
  if (body?.violation) {
    const kind = typeof body.violation.kind === "string" && OWNER_VIOLATION_KINDS[body.violation.kind] ? body.violation.kind : null;
    const detail = typeof body.violation.detail === "string" ? body.violation.detail.trim().slice(0, 600) : "";
    if (!kind) return fail("어떤 위반인지 골라 주세요.", 400);
    if (detail.length < 10) return fail("무슨 일이 있었는지 10자 이상 적어 주세요. 사진 등 증빙은 같이가개가 연락할 때 보내 주세요.", 400);
    const { data: stay } = await db.from("lodging_bookings").select("status, check_in, check_out, guest_auth_user_id, room_name, guest_name, issue_status").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
    if (!stay) return fail("예약을 찾을 수 없어요.", 404);
    if (!canReportViolation(stay, kstToday())) return fail("체크인 날부터 체크아웃 후 14일까지, 확인 중인 문제가 없는 예약만 접수할 수 있어요.", 409);
    const { data, error } = await db.from("lodging_bookings").update({
      issue_status: "open", issue_kind: kind, issue_detail: detail, issue_owner_reply: "숙소가 직접 접수했어요.", issue_opened_at: now, payout_status: "held", updated_at: now,
    }).eq("id", id).eq("place_id", ctx.placeId).eq("issue_status", "none").select(BOOKING_FULL_COLUMNS).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    after(() => notifyAdmin({ title: "🚩 숙소의 규정 위반 접수", lines: [`예약 #${id} · ${stay.room_name} · ${stay.guest_name}님`, OWNER_VIOLATION_KINDS[kind], detail.slice(0, 80)], path: "/admin/stays" }));
    if (stay.guest_auth_user_id) after(() => notifyGuest(stay.guest_auth_user_id, { kind: "stay_violation", title: "숙소가 규정 위반을 접수했어요", body: `${OWNER_VIOLATION_KINDS[kind]} — 같이가개가 확인한 뒤 알려 드려요. 이의가 있으면 내역에서 확인해 주세요.`, url: "/orders?tab=stay" }));
    return NextResponse.json({ booking: data });
  }

  // 현금영수증 발급 완료 표시 — 발급은 숙소가 합니다
  if (body?.cashReceiptIssued === true) {
    const { data: row } = await db.from("lodging_bookings").select("cash_receipt, payment_method").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
    if (!row || row.payment_method !== "transfer") return fail("계좌이체 예약만 표시할 수 있어요.", 409);
    const { data, error } = await db.from("lodging_bookings").update({ cash_receipt: { ...(row.cash_receipt ?? { type: "none", number: null }), status: "issued", issued_at: now }, updated_at: now })
      .eq("id", id).eq("place_id", ctx.placeId).select(BOOKING_FULL_COLUMNS).maybeSingle();
    if (error) return fail(error.message, 500);
    return NextResponse.json({ booking: data });
  }

  // 문제 접수에 대한 의견
  if (typeof body?.issueReply === "string") {
    const reply = body.issueReply.trim().slice(0, 600);
    if (!reply) return fail("의견을 적어 주세요.", 400);
    const { data, error } = await db.from("lodging_bookings").update({ issue_owner_reply: reply, updated_at: now })
      .eq("id", id).eq("place_id", ctx.placeId).eq("issue_status", "open").select(BOOKING_FULL_COLUMNS).maybeSingle();
    if (error) return fail(isMissingSchema(error) ? NEED_SETTLEMENT_SQL : error.message, isMissingSchema(error) ? 503 : 500);
    if (!data) return fail("처리 중인 문제 접수가 없어요.", 409);
    after(() => notifyAdmin({ title: "💬 숙박 문제 — 사장님 의견 도착", lines: [`예약 #${id}`, reply.slice(0, 80)], path: "/admin/stays" }));
    return NextResponse.json({ booking: data });
  }

  const next = body?.status as StayStatus;
  const { data: found, error: findError } = await db.from("lodging_bookings").select(`${MONEY_COLUMNS}, room_id, room_name, guest_name`).eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
  if (findError) return fail(isMissingSchema(findError) ? NEED_SETTLEMENT_SQL : findError.message, isMissingSchema(findError) ? 503 : 500);
  if (!found) return fail("예약을 찾을 수 없어요.", 404);
  const current = found as MoneyBooking & { room_id: number; room_name: string; guest_name: string };
  if (!canChangeStay("owner", current.status, next)) return fail("지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로 고쳐 주세요.", 409);
  const notes = ownerNote ? { owner_note: ownerNote } : {};

  try {
    if (next === "confirmed") {
      const overlaps = await confirmedOverlaps(Number(current.room_id), current.check_in, current.check_out, id);
      if (overlaps.length > 0) return fail("같은 객실에 이미 확정된 예약과 날짜가 겹쳐요. 날짜를 확인해 주세요.", 409);
      const { data, error } = await db.from("lodging_bookings").update({ status: "confirmed", decided_at: now, updated_at: now, ...notes })
        // 그 사이 손님이 취소했을 수 있으니, 방금 확인한 상태일 때만 바꿉니다.
        .eq("id", id).eq("place_id", ctx.placeId).eq("status", current.status).select(BOOKING_COLUMNS).maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
      after(() => notifyStayGuest(id, "confirmed"));
      return NextResponse.json({ booking: data });
    }
    if (next === "no_show" && kstToday() < current.check_in) return fail("노쇼는 체크인 날부터 처리할 수 있어요.", 409);

    const cause = next === "declined" ? "not_confirmed" : next === "no_show" ? "guest" : "owner";
    const done = await applyCancel(current, cause, next, current.status, { ...notes, ...(current.status === "requested" ? { decided_at: now } : {}) });
    if (!done) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    // 손님에게 알림(거절·숙소 사정 취소) — 노쇼는 알리지 않습니다
    if (next === "declined" || next === "cancelled_by_owner") after(() => notifyStayGuest(id, next));
    if (next === "cancelled_by_owner") {
      const comp = done.outcome.compensation;
      after(() => notifyAdmin({
        title: "⚠️ 숙소 사정 예약 취소",
        lines: [`예약 #${id} · ${current.room_name} · ${current.guest_name}님`, `손님 전액 환불 ${won(done.outcome.refund)}`, comp == null ? "배상률이 정해지지 않은 구간 — 배상금 확인 필요" : `배상금 ${won(comp)}(다음 정산에서 차감)`, ownerNote && `사유: ${ownerNote}`],
        path: "/admin/stays",
      }));
    }
    return NextResponse.json({ booking: done.booking, outcome: done.outcome });
  } catch (e) {
    const message = e instanceof Error ? e.message : "처리하지 못했어요.";
    return fail(/does not exist|schema cache|column/i.test(message) ? NEED_SETTLEMENT_SQL : message, 500);
  }
}
