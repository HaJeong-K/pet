// src/lib/server/storeOrders.ts
//
// 쇼핑 주문의 돈·자동 처리(서버 전용).
//   · refundStoreOrder: 전액 환불하고 결과를 주문에 적습니다. 실패하면 payment_status = 'refund_failed'로 남아 관리자가 다시 시도합니다.
//   · runStoreOrderChores: 결제 안 한 주문 지우기, 가게가 확인하지 않은 주문 자동 취소(전액 환불), 시간 지난 주문 자동 이용 완료.
//     매일 새벽 작업과 내역·사장님 화면을 열 때 함께 돕니다.

import { db, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { expireUnpaid, refundPayment } from "@/lib/server/payments";
import { notifyGuest } from "@/lib/server/guestNotify";
import { STORE_AUTO_COMPLETE_MS, STORE_CONFIRM_LIMIT_MS } from "@/lib/storeRules";

/** 주문 한 건을 전액 환불합니다(결제한 주문만) */
export async function refundStoreOrder(order: { id: number; total: number; payment_status?: string | null }, reason: string): Promise<void> {
  if (order.payment_status !== "paid" && order.payment_status !== "refund_failed") return;
  const result = await refundPayment("store", order.id, order.total, reason);
  const now = new Date().toISOString();
  if (result === "done") await db.from("place_reservations").update({ payment_status: "refunded", refund_amount: order.total, refund_done_at: now, updated_at: now }).eq("id", order.id);
  else await db.from("place_reservations").update({ payment_status: "refund_failed", refund_amount: order.total, updated_at: now }).eq("id", order.id);
}

/** 손님에게 주문 상태 알림 */
export async function notifyOrderCustomer(customerId: string | null | undefined, placeId: number, title: string, text: string): Promise<void> {
  if (!customerId) return;
  const { data: place } = await db.from("places").select("name").eq("id", placeId).maybeSingle();
  await notifyGuest(customerId, { kind: "store_order", title, body: `${place?.name ?? "가게"} · ${text}`, url: "/orders?tab=store" });
}

export async function runStoreOrderChores(placeId?: number): Promise<{ unpaid: number; autoRejected: number; autoCompleted: number }> {
  const now = Date.now();
  const unpaid = placeId == null ? await expireUnpaid() : 0;

  // 가게가 확인하지 않은 주문: 12시간이 지났거나 약속 시간이 지나면 자동 취소하고 전액 환불
  let waitingQuery = db.from("place_reservations").select(RESERVATION_COLUMNS).eq("status", "requested").limit(300);
  if (placeId != null) waitingQuery = waitingQuery.eq("place_id", placeId);
  const { data: waiting } = await waitingQuery;
  let autoRejected = 0;
  for (const r of waiting ?? []) {
    const late = now - new Date(r.created_at).getTime() > STORE_CONFIRM_LIMIT_MS || (r.pickup_at && new Date(r.pickup_at).getTime() < now);
    if (!late) continue;
    const { data: changed } = await db.from("place_reservations").update({ status: "rejected", owner_note: "가게가 시간 안에 확인하지 않아 자동 취소", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "requested").select("id").maybeSingle();
    if (!changed) continue;
    autoRejected++;
    await refundStoreOrder(r, "가게 미확인 자동 취소");
    await notifyOrderCustomer(r.customer_auth_user_id, r.place_id, "주문이 자동 취소됐어요", "가게가 시간 안에 확인하지 않아 전액 환불해요.");
  }

  // 확정한 주문: 약속 시간(없으면 마지막 변경)에서 24시간이 지나면 이용 완료 — 후기를 쓸 수 있고 정산 대상이 됩니다. 취소 요청이 열려 있으면 기다립니다.
  let openQuery = db.from("place_reservations").select(RESERVATION_COLUMNS).in("status", ["accepted", "ready"]).neq("cancel_request_status", "open").limit(300);
  if (placeId != null) openQuery = openQuery.eq("place_id", placeId);
  const { data: open } = await openQuery;
  let autoCompleted = 0;
  for (const r of open ?? []) {
    const base = new Date(r.pickup_at ?? r.updated_at).getTime();
    if (now - base < STORE_AUTO_COMPLETE_MS) continue;
    const { data: changed } = await db.from("place_reservations").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", r.status).select("id").maybeSingle();
    if (changed) autoCompleted++;
  }
  return { unpaid, autoRejected, autoCompleted };
}
