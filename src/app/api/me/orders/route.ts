import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, userOf, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { paymentInfoOf } from "@/lib/server/payments";
import { refundStoreOrder, runStoreOrderChores } from "@/lib/server/storeOrders";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { canChangeStatus, canRequestCancel, canReviewOrder, type ReservationStatus } from "@/lib/storeRules";

// 손님의 쇼핑 주문 내역(/orders)
//   GET   → 내 주문 + 가게 이름·전화 + 결제 수단·영수증 + 할 수 있는 일(취소·취소 요청·후기)
//   PATCH → { id, action }
//           "cancel"         : 가게가 확정하기 전 — 바로 취소하고 전액 환불
//           "cancel_request" : 확정 뒤 — 취소 요청 { reason }. 사장님이 받아 주면 전액 환불
//           "abandon"        : 결제하지 않은 주문 지우기

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  after(() => runStoreOrderChores().catch(() => {}));
  const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS).eq("customer_auth_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, orders: [] }) : fail(error.message, 500);
  const rows = data ?? [];
  const ids = rows.map((r) => Number(r.id));
  const placeIds = [...new Set(rows.map((r) => Number(r.place_id)))];
  const [{ data: places }, { data: reviews }, payments] = await Promise.all([
    placeIds.length ? db.from("places").select("id, name, address, phone").in("id", placeIds) : Promise.resolve({ data: [] as { id: number; name: string; address: string | null; phone: string | null }[] }),
    ids.length ? db.from("store_reviews").select("reservation_id, rating, content, owner_reply").in("reservation_id", ids) : Promise.resolve({ data: [] as { reservation_id: number; rating: number; content: string; owner_reply: string | null }[] }),
    paymentInfoOf("store", ids),
  ]);
  const now = Date.now();
  const orders = rows.map(({ customer_auth_user_id: _hidden, ...r }) => {
    const review = (reviews ?? []).find((x) => Number(x.reservation_id) === Number(r.id)) ?? null;
    return {
      ...r,
      place: (places ?? []).find((p) => Number(p.id) === Number(r.place_id)) ?? null,
      payment: payments.get(Number(r.id)) ?? null,
      review,
      canCancel: canChangeStatus("customer", r.status as ReservationStatus, "cancelled"),
      canRequestCancel: canRequestCancel(r.status as ReservationStatus, r.cancel_request_status),
      canReview: !review && canReviewOrder(r.status as ReservationStatus, r.updated_at, now),
    };
  });
  return NextResponse.json({ ready: true, orders });
}

export async function PATCH(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("주문을 찾을 수 없어요.", 400);
  const { data: r } = await db.from("place_reservations").select(RESERVATION_COLUMNS).eq("id", id).eq("customer_auth_user_id", user.id).maybeSingle();
  if (!r) return fail("주문을 찾을 수 없어요.", 404);
  const now = new Date().toISOString();

  if (body?.action === "abandon") {
    if (r.status !== "pending_payment") return fail("결제하지 않은 주문만 지울 수 있어요.", 409);
    await db.from("place_reservations").delete().eq("id", id).eq("status", "pending_payment");
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "cancel") {
    if (!canChangeStatus("customer", r.status as ReservationStatus, "cancelled")) return fail("가게에서 이미 확정했어요. 취소 요청을 보내 주세요.", 409);
    const { data: changed } = await db.from("place_reservations").update({ status: "cancelled", updated_at: now }).eq("id", id).eq("status", r.status).select("id").maybeSingle();
    if (!changed) return fail("그 사이 주문 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    await refundStoreOrder(r, "손님 취소(가게 확정 전)");
    after(() => sendOwnerPush(Number(r.place_id), { title: "주문이 취소됐어요", body: `${r.customer_name}님이 주문을 취소했어요(전액 환불).`, tag: `ggk-order-${id}`, url: "/owner#reservations" }));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "cancel_request") {
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!reason) return fail("취소하려는 이유를 적어 주세요.", 400);
    if (!canRequestCancel(r.status as ReservationStatus, r.cancel_request_status)) return fail("지금은 취소 요청을 보낼 수 없어요.", 409);
    const { data: changed } = await db.from("place_reservations").update({ cancel_request_status: "open", cancel_request_reason: reason, cancel_requested_at: now, updated_at: now }).eq("id", id).eq("status", r.status).select("id").maybeSingle();
    if (!changed) return fail("그 사이 주문 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    after(() => sendOwnerPush(Number(r.place_id), { title: "손님이 주문 취소를 요청했어요", body: `${r.customer_name}님: ${reason.slice(0, 80)}`, tag: `ggk-order-${id}`, url: "/owner#reservations" }));
    return NextResponse.json({ ok: true });
  }
  return fail("요청이 올바르지 않아요.", 400);
}
