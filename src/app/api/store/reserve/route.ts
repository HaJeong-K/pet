import { NextRequest, NextResponse, after } from "next/server";
import { db, listProducts, storeEnabled, storeOrderModes, userOf, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { buildReservationLines, canChangeStatus, cleanOrderOptions, cleanReservationContact, type ReservationStatus, cleanStoreInfo, couponProblem, isWithinOrderHours, koreaDay, orderHoursToday } from "@/lib/storeRules";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { notifyOwnerNewReservation } from "@/lib/server/ownerPush";
import { paymentsEnabled } from "@/lib/server/payments";
import { refundStoreOrder } from "@/lib/server/storeOrders";
import { PAYMENT_MIN_AMOUNT } from "@/lib/payments";

// 손님의 포장 주문·매장 식사 예약 — 로그인한 회원만. 선결제: 'pending_payment'로 만들고 needsPayment를 돌려주면 화면이 결제창을 엽니다.
// 결제를 마쳐야 사장님에게 보이고 알림이 갑니다(/api/payments/confirm). 결제 키를 넣기 전에는 결제 단계 없이 접수됩니다.
//   POST  → 주문 넣기 { placeId, orderType, partySize, items: [{ productId, qty }], name, phone, pickupAt, memo }
//   PATCH → 내 주문 취소 { id }  (가게가 확정하기 전까지만, 전액 환불. 확정 뒤에는 /api/me/orders의 취소 요청)
// 상품 이름·가격은 손님이 보낸 값이 아니라 가게가 올린 값으로 다시 계산합니다.
// 예약이 들어가면 그 가게 사장님의 기기로 알림을 보냅니다(src/lib/server/ownerPush.ts).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
// 한 사람이 10분에 5건까지 — 장난 예약으로 가게가 곤란해지지 않게.
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });
/** 한 가게에 동시에 걸어 둘 수 있는 진행 중인 예약 수 */
const OPEN_PER_PLACE_MAX = 3;

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 예약할 수 있어요.", 401);
  if (!allow(user.id)) return fail("예약을 너무 자주 넣었어요. 잠시 후 다시 시도해 주세요.", 429);

  const body = await req.json().catch(() => null);
  const placeId = Number(body?.placeId);
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("가게를 찾을 수 없어요.", 400);
  if (!(await storeEnabled(placeId))) return fail("지금은 이 가게에서 예약을 받지 않아요.", 403);

  // 가입 정보가 있으면 그 이름·전화로 받습니다(주문 화면에서 고칠 수 없습니다)
  const { data: saved } = await db.from("user_contacts").select("name, phone").eq("auth_user_id", user.id).maybeSingle();
  // 회원 이름·휴대폰이 등록돼 있어야 주문할 수 있습니다(2026-11-07)
  if (!saved?.name || !saved?.phone) return fail("이름과 휴대폰 번호를 먼저 등록해 주세요.", 400);
  const contact = cleanReservationContact({ ...body, name: saved.name, phone: saved.phone });
  if ("error" in contact) return fail(contact.error, 400);
  const options = cleanOrderOptions(body, await storeOrderModes(placeId), contact.pickupAt);
  if ("error" in options) return fail(options.error, 400);
  const { data: hours } = await db.from("places").select("order_open_time, order_close_time, orders_closed_on, store_info, order_week").eq("id", placeId).maybeSingle();
  // 사장님이 오늘 주문을 마감했으면 오늘 받는 주문은 막습니다(매장 식사의 다른 날 예약은 받습니다)
  if (hours?.orders_closed_on === koreaDay(Date.now()) && (options.orderType === "pickup" || (contact.pickupAt && koreaDay(contact.pickupAt) === koreaDay(Date.now())))) {
    return fail("이 가게는 오늘 주문을 마감했어요.", 400);
  }
  if (options.orderType === "pickup") {
    const today = orderHoursToday(hours ?? {});
    if (today.closedDay) return fail("오늘은 포장 주문을 받지 않는 날이에요.", 400);
    if (!isWithinOrderHours(today.open, today.close)) return fail(`지금은 포장 주문 시간이 아니에요. 오늘 주문 가능 시간은 ${today.open}~${today.close}이에요.`, 400);
  }
  const { products } = await listProducts(placeId, true);
  const built = buildReservationLines(body?.items, products);
  if ("error" in built) return fail(built.error, 400);

  const minOrder = cleanStoreInfo(hours?.store_info).minOrder;
  if (built.total < minOrder) return fail(`이 가게의 최소 주문 금액은 ${minOrder.toLocaleString("ko-KR")}원이에요.`, 400);

  const { count } = await db.from("place_reservations").select("*", { count: "exact", head: true })
    .eq("place_id", placeId).eq("customer_auth_user_id", user.id).in("status", ["requested", "accepted", "ready"]);
  if ((count ?? 0) >= OPEN_PER_PLACE_MAX) return fail("이 가게에 진행 중인 예약이 이미 있어요. 먼저 그 예약을 확인해 주세요.", 409);

  // 쿠폰 — 금액은 서버의 값으로, 손님 한 명당 한 번(취소·거절된 주문은 쓴 것으로 세지 않습니다)
  let discount = 0;
  const couponId = Number(body?.couponId);
  if (Number.isInteger(couponId) && couponId > 0) {
    const { data: coupon } = await db.from("store_coupons").select("id, discount, min_order, expires_on, is_active").eq("id", couponId).eq("place_id", placeId).maybeSingle();
    if (!coupon) return fail("쓸 수 없는 쿠폰이에요.", 400);
    const problem = couponProblem(coupon, built.total);
    if (problem) return fail(problem, 400);
    const { count: used } = await db.from("place_reservations").select("*", { count: "exact", head: true }).eq("coupon_id", couponId).eq("customer_auth_user_id", user.id).not("status", "in", "(cancelled,rejected)");
    if ((used ?? 0) > 0) return fail("이미 쓴 쿠폰이에요.", 400);
    discount = coupon.discount;
  }
  const payTotal = built.total - discount;

  const needsPayment = paymentsEnabled() && payTotal >= PAYMENT_MIN_AMOUNT;
  const { data, error } = await db.from("place_reservations").insert([{
    ...(needsPayment ? { status: "pending_payment" } : {}),
    place_id: placeId,
    customer_auth_user_id: user.id,
    customer_name: contact.name,
    customer_phone: contact.phone,
    items: built.lines,
    total: payTotal,
    ...(discount > 0 ? { coupon_id: couponId, discount } : {}),
    pickup_at: contact.pickupAt,
    memo: contact.memo,
    order_type: options.orderType,
    party_size: options.partySize,
  }]).select(RESERVATION_COLUMNS).single();
  if (error) return fail(error.message, 500);
  // 사장님 기기로 "멍멍! 새 예약" 알림 — 응답을 보낸 뒤에 보내서 손님을 기다리게 하지 않습니다.
  if (!needsPayment) after(() => notifyOwnerNewReservation(placeId, data));
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest, needsPayment });
}

export async function PATCH(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);

  const { data: current } = await db.from("place_reservations").select("status, total, payment_status").eq("id", id).eq("customer_auth_user_id", user.id).maybeSingle();
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  if (!canChangeStatus("customer", current.status as ReservationStatus, "cancelled")) return fail("가게에서 이미 확정해 준비를 시작했어요. 취소는 가게에 직접 연락해 주세요.", 409);

  const { data, error } = await db.from("place_reservations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("customer_auth_user_id", user.id).eq("status", current.status)
    .select(RESERVATION_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  await refundStoreOrder({ id, total: current.total, payment_status: current.payment_status }, "손님 취소(가게 확정 전)");
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest });
}
