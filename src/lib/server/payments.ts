// src/lib/server/payments.ts
//
// 선결제(토스페이먼츠) — 숙박 예약과 쇼핑 주문이 함께 씁니다. 표는 scripts/sql/payments.sql.
//   흐름: 예약·주문을 'pending_payment'로 만듦 → preparePayment → 토스 결제창 → /pay/success → confirmPayment
//         승인에 성공해야 사장님에게 보이고 알림이 갑니다. 20분 안에 결제하지 않으면 지워집니다(결제되지 않은 건이라 돈은 오가지 않음).
//   환불: refundPayment — 실패하면 관리자에게 알리고 관리자 화면에 남습니다.
//   TOSS_SECRET_KEY·NEXT_PUBLIC_TOSS_CLIENT_KEY가 없으면 paymentsEnabled()가 false이고, 결제 단계 없이 예약만 접수됩니다.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";
import { PAYMENT_HOLD_MS, type PaymentKind } from "@/lib/payments";

const API = "https://api.tosspayments.com/v1/payments";

export const paymentsEnabled = () => !!(process.env.TOSS_SECRET_KEY && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);

type TossPayment = { paymentKey: string; orderId: string; status: string; method: string | null; totalAmount: number; balanceAmount: number; receipt?: { url?: string } | null };

async function toss(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<{ ok: true; data: TossPayment } | { ok: false; code: string; message: string }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "POST",
    headers: {
      // 시크릿 키 뒤에 콜론을 붙여 base64로 인코딩합니다
      Authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: json as TossPayment } : { ok: false, code: json.code ?? "UNKNOWN", message: json.message ?? "결제사 응답을 받지 못했어요." };
}

type PayableOrder = { id: number; status: string; total: number; ownerId: string; orderName: string };

async function loadOrder(kind: PaymentKind, id: number): Promise<PayableOrder | null> {
  if (kind === "lodging") {
    const { data } = await db.from("lodging_bookings").select("id, status, total, guest_auth_user_id, room_name, nights, place_id").eq("id", id).maybeSingle();
    if (!data) return null;
    const { data: place } = await db.from("places").select("name").eq("id", data.place_id).maybeSingle();
    return { id, status: data.status, total: data.total, ownerId: data.guest_auth_user_id, orderName: `${place?.name ?? "숙소"} ${data.room_name} ${data.nights}박`.slice(0, 90) };
  }
  const { data } = await db.from("place_reservations").select("id, status, total, customer_auth_user_id, place_id, order_type").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: place } = await db.from("places").select("name").eq("id", data.place_id).maybeSingle();
  return { id, status: data.status, total: data.total, ownerId: data.customer_auth_user_id, orderName: `${place?.name ?? "가게"} ${data.order_type === "dine_in" ? "매장 식사" : "포장"} 주문`.slice(0, 90) };
}

/** 결제창을 열 값을 만듭니다. 금액은 항상 예약·주문에 적힌 금액입니다. */
export async function preparePayment(kind: PaymentKind, id: number, userId: string) {
  const order = await loadOrder(kind, id);
  if (!order || order.ownerId !== userId) return { error: "결제할 내역을 찾을 수 없어요.", status: 404 };
  if (order.status !== "pending_payment") return { error: "이미 결제했거나 결제 시간이 지난 내역이에요.", status: 409 };
  const orderId = `ggk-${kind === "lodging" ? "l" : "s"}${id}-${randomBytes(6).toString("hex")}`;
  const { error } = await db.from("payments").insert([{ order_id: orderId, kind, ref_id: id, auth_user_id: userId, order_name: order.orderName, amount: order.total }]);
  if (error) return { error: error.message, status: 500 };
  return { orderId, amount: order.total, orderName: order.orderName };
}

/** 결제 승인. 끝나면 호출한 쪽이 예약·주문을 바꾸지 않아도 되도록 onPaid 처리까지 합니다. */
export async function confirmPayment(
  input: { paymentKey: string; orderId: string; amount: number },
  userId: string,
  onPaid: (kind: PaymentKind, refId: number, paidAt: string) => Promise<boolean>,
): Promise<{ kind: PaymentKind; refId: number } | { error: string; status: number }> {
  const { data: row } = await db.from("payments").select("id, kind, ref_id, amount, status, auth_user_id, order_name").eq("order_id", input.orderId).maybeSingle();
  if (!row || row.auth_user_id !== userId) return { error: "결제 내역을 찾을 수 없어요.", status: 404 };
  const kind = row.kind as PaymentKind;
  const refId = Number(row.ref_id);
  if (row.status === "paid") return { kind, refId }; // 새로 고침 등으로 다시 들어온 경우
  // 결제창을 거치며 금액이 바뀌지 않았는지 — 바뀌었으면 승인하지 않아 돈이 나가지 않습니다
  if (row.amount !== input.amount) return { error: "결제 금액이 주문과 달라 결제하지 않았어요.", status: 400 };
  const order = await loadOrder(kind, refId);
  if (!order || order.status !== "pending_payment" || order.total !== row.amount) return { error: "결제 시간이 지났어요. 처음부터 다시 진행해 주세요.", status: 409 };

  const result = await toss("/confirm", { body: input, idempotencyKey: `confirm-${input.orderId}` });
  if (!result.ok) {
    await db.from("payments").update({ status: "failed", failure: `${result.code}: ${result.message}`.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", row.id);
    return { error: result.message, status: 402 };
  }
  const paidAt = new Date().toISOString();
  await db.from("payments").update({ status: "paid", payment_key: result.data.paymentKey, method: result.data.method, receipt_url: result.data.receipt?.url ?? null, paid_at: paidAt, updated_at: paidAt }).eq("id", row.id);

  // 승인과 만료가 겹쳐 예약이 이미 사라졌으면 곧바로 전액 돌려줍니다
  if (!(await onPaid(kind, refId, paidAt))) {
    await refundPayment(kind, refId, row.amount, "결제 시간 초과로 자동 취소");
    return { error: "결제 시간이 지나 자동으로 취소하고 환불했어요. 처음부터 다시 진행해 주세요.", status: 409 };
  }
  return { kind, refId };
}

export type RefundResult = "none" | "done" | "failed";

/** 결제를 전액·일부 환불합니다. 토스로 결제한 적이 없으면 "none"(관리자 수동 처리 대상) */
export async function refundPayment(kind: PaymentKind, refId: number, amount: number, reason: string): Promise<RefundResult> {
  if (amount <= 0) return "none";
  const { data: row } = await db.from("payments").select("id, payment_key, amount, refunded_amount").eq("kind", kind).eq("ref_id", refId).in("status", ["paid", "partial_refunded"]).maybeSingle();
  if (!row?.payment_key) return "none";
  const left = row.amount - row.refunded_amount;
  const cancelAmount = Math.min(amount, left);
  if (cancelAmount <= 0) return "done";
  const result = await toss(`/${encodeURIComponent(row.payment_key)}/cancel`, {
    body: { cancelReason: reason.slice(0, 200), ...(cancelAmount < left ? { cancelAmount } : {}) },
    // 두 번 눌려도 한 번만 환불되도록
    idempotencyKey: `refund-${kind}-${refId}-${row.refunded_amount}-${cancelAmount}`,
  });
  if (!result.ok) {
    console.error("[payments] refund failed:", kind, refId, result.code);
    await notifyAdmin({ title: "🚨 자동 환불 실패", lines: [`${kind === "lodging" ? "숙박 예약" : "쇼핑 주문"} #${refId}`, `${cancelAmount.toLocaleString("ko-KR")}원`, result.message], path: "/admin/stays" }).catch(() => {});
    return "failed";
  }
  const refunded = row.refunded_amount + cancelAmount;
  await db.from("payments").update({ refunded_amount: refunded, status: refunded >= row.amount ? "refunded" : "partial_refunded", updated_at: new Date().toISOString() }).eq("id", row.id);
  return "done";
}

/** 웹훅: 토스 쪽 상태를 다시 물어 환불 금액을 맞춥니다(토스 관리자 화면에서 직접 취소한 경우 등). 본문은 믿지 않습니다. */
export async function syncPaymentFromToss(paymentKey: string): Promise<void> {
  const { data: row } = await db.from("payments").select("id, amount").eq("payment_key", paymentKey).maybeSingle();
  if (!row) return;
  const result = await toss(`/${encodeURIComponent(paymentKey)}`, { method: "GET" });
  if (!result.ok) return;
  const refunded = result.data.totalAmount - result.data.balanceAmount;
  await db.from("payments").update({ refunded_amount: refunded, status: refunded <= 0 ? "paid" : refunded >= row.amount ? "refunded" : "partial_refunded", updated_at: new Date().toISOString() }).eq("id", row.id);
}

/** 20분 안에 결제하지 않은 예약·주문을 지웁니다(roomId를 주면 그 객실만) */
export async function expireUnpaid(roomId?: number): Promise<number> {
  const before = new Date(Date.now() - PAYMENT_HOLD_MS).toISOString();
  let stays = db.from("lodging_bookings").delete({ count: "exact" }).eq("status", "pending_payment").lt("created_at", before);
  if (roomId != null) stays = stays.eq("room_id", roomId);
  const { count: a } = await stays;
  if (roomId != null) return a ?? 0;
  const { count: b } = await db.from("place_reservations").delete({ count: "exact" }).eq("status", "pending_payment").lt("created_at", before);
  return (a ?? 0) + (b ?? 0);
}

export type PaymentInfo = { method: string | null; receiptUrl: string | null; paidAt: string | null; refunded: number };

/** 내역 화면용: 예약·주문별 결제 수단·영수증 */
export async function paymentInfoOf(kind: PaymentKind, ids: number[]): Promise<Map<number, PaymentInfo>> {
  const map = new Map<number, PaymentInfo>();
  if (ids.length === 0) return map;
  const { data } = await db.from("payments").select("ref_id, method, receipt_url, paid_at, refunded_amount").eq("kind", kind).in("ref_id", ids).in("status", ["paid", "partial_refunded", "refunded"]);
  for (const p of data ?? []) map.set(Number(p.ref_id), { method: p.method, receiptUrl: p.receipt_url, paidAt: p.paid_at, refunded: p.refunded_amount });
  return map;
}
