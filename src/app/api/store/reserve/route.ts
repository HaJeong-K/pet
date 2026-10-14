import { NextRequest, NextResponse, after } from "next/server";
import { db, listProducts, storeEnabled, userOf, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { buildReservationLines, canChangeStatus, cleanReservationContact, type ReservationStatus } from "@/lib/storeRules";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { notifyOwnerNewReservation } from "@/lib/server/ownerPush";

// 손님의 예약(포장) 요청 — 로그인한 회원만. 결제는 받지 않고, 가게에서 결제합니다.
//   POST  → 예약 넣기 { placeId, items: [{ productId, qty }], name, phone, pickupAt, memo }
//   PATCH → 내 예약 취소 { id }  (가게가 준비를 마치기 전까지만)
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

  const contact = cleanReservationContact(body);
  if ("error" in contact) return fail(contact.error, 400);
  const { products } = await listProducts(placeId, true);
  const built = buildReservationLines(body?.items, products);
  if ("error" in built) return fail(built.error, 400);

  const { count } = await db.from("place_reservations").select("*", { count: "exact", head: true })
    .eq("place_id", placeId).eq("customer_auth_user_id", user.id).in("status", ["requested", "accepted", "ready"]);
  if ((count ?? 0) >= OPEN_PER_PLACE_MAX) return fail("이 가게에 진행 중인 예약이 이미 있어요. 먼저 그 예약을 확인해 주세요.", 409);

  const { data, error } = await db.from("place_reservations").insert([{
    place_id: placeId,
    customer_auth_user_id: user.id,
    customer_name: contact.name,
    customer_phone: contact.phone,
    items: built.lines,
    total: built.total,
    pickup_at: contact.pickupAt,
    memo: contact.memo,
  }]).select(RESERVATION_COLUMNS).single();
  if (error) return fail(error.message, 500);
  // 사장님 기기로 "멍멍! 새 예약" 알림 — 응답을 보낸 뒤에 보내서 손님을 기다리게 하지 않습니다.
  after(() => notifyOwnerNewReservation(placeId, data));
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest });
}

export async function PATCH(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);

  const { data: current } = await db.from("place_reservations").select("status").eq("id", id).eq("customer_auth_user_id", user.id).maybeSingle();
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  if (!canChangeStatus("customer", current.status as ReservationStatus, "cancelled")) return fail("가게에서 이미 준비를 마쳐 취소할 수 없어요. 가게에 직접 연락해 주세요.", 409);

  const { data, error } = await db.from("place_reservations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("customer_auth_user_id", user.id).eq("status", current.status)
    .select(RESERVATION_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest });
}
