import { NextRequest, NextResponse, after } from "next/server";
import { db, userOf } from "@/lib/server/ownerStore";
import { confirmPayment, paymentsEnabled } from "@/lib/server/payments";
import { sendOwnerPush, notifyOwnerNewReservation } from "@/lib/server/ownerPush";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { won } from "@/lib/ownerPlans";
import type { PaymentKind } from "@/lib/payments";

// 결제 승인 — 토스 결제창이 /pay/success로 돌아온 뒤 그 화면이 부릅니다. { paymentKey, orderId, amount }
// 승인에 성공하면 예약·주문이 'pending_payment'에서 정식 접수로 바뀌고, 이때 사장님에게 알림이 갑니다.

async function markStayPaid(id: number, paidAt: string): Promise<boolean> {
  const { data: b } = await db.from("lodging_bookings").select("place_id").eq("id", id).maybeSingle();
  if (!b) return false;
  // 즉시 확정 숙소는 결제와 함께 바로 확정됩니다(계약서 제8조 제3항)
  const { data: flags } = await db.from("lodging_profiles").select("instant_confirm").eq("place_id", b.place_id).maybeSingle();
  const instant = flags?.instant_confirm === true;
  const { data } = await db.from("lodging_bookings")
    .update({ status: instant ? "confirmed" : "requested", payment_status: "paid", paid_at: paidAt, updated_at: paidAt, ...(instant ? { decided_at: paidAt } : {}) })
    .eq("id", id).eq("status", "pending_payment")
    .select("place_id, guest_name, room_name, check_in, check_out, nights, guests, pets, total").maybeSingle();
  if (!data) return false;
  after(() => sendOwnerPush(Number(data.place_id), {
    title: instant ? "멍멍! 새 숙박 예약이 확정됐어요" : "멍멍! 새 숙박 예약 요청이 들어왔어요",
    body: `${data.guest_name}님 · ${data.room_name} · ${stayDayLabel(data.check_in)}~${stayDayLabel(data.check_out)} ${data.nights}박 · ${data.guests}명·반려동물 ${(data.pets ?? []).length}마리 · ${won(data.total)} 결제 완료${instant ? "" : "\n24시간 안에 확정하거나 거절해 주세요."}`,
    tag: `ggk-stay-${id}`,
    url: "/owner#stays",
  }));
  return true;
}

async function markOrderPaid(id: number, paidAt: string): Promise<boolean> {
  const { data } = await db.from("place_reservations")
    .update({ status: "requested", payment_status: "paid", paid_at: paidAt, updated_at: paidAt })
    .eq("id", id).eq("status", "pending_payment").select("*").maybeSingle();
  if (!data) return false;
  after(() => notifyOwnerNewReservation(Number(data.place_id), data));
  return true;
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!paymentsEnabled()) return NextResponse.json({ error: "카드 결제를 준비하고 있어요." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const paymentKey = typeof body?.paymentKey === "string" ? body.paymentKey : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const amount = Number(body?.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) return NextResponse.json({ error: "결제 정보가 올바르지 않아요." }, { status: 400 });
  const result = await confirmPayment({ paymentKey, orderId, amount }, user.id, (kind: PaymentKind, refId, paidAt) => (kind === "lodging" ? markStayPaid(refId, paidAt) : markOrderPaid(refId, paidAt)));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, kind: result.kind, id: result.refId });
}
