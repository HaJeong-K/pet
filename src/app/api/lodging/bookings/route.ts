import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { BOOKING_COLUMNS, confirmedOverlaps, getLodging, roomDays } from "@/lib/server/lodgingStore";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { canChangeStay, cleanStayRequest, kstToday, OPEN_STAYS_PER_GUEST, petsAllowed, quoteStay, type StayStatus } from "@/lib/lodgingBooking";
import { won } from "@/lib/ownerPlans";

// 손님의 숙박 예약 — 로그인한 회원만. 결제는 받지 않고 숙소에서 직접 결제합니다(현장 결제).
//   GET   → 내 숙박 예약 목록
//   POST  → 예약 요청 { roomId, checkIn, checkOut, guests, pets: [{ species, size, weight, name }], name, phone, memo }
//   PATCH → 내 예약 취소 { id }  (확인 대기·확정 상태에서 체크인 전까지)
// 요금은 손님이 보낸 값이 아니라 숙소가 올린 요금(평일/주말·날짜별 요금·인원·반려동물 추가 요금)으로 다시 계산합니다.
// 동반 규정(종류·크기·몸무게·마릿수)에 맞지 않거나 막은 날·이미 확정된 날이 끼어 있으면 받지 않습니다.
// 요청이 들어가면 숙소 사장님 기기로 "멍멍!" 알림을 보냅니다(src/lib/server/ownerPush.ts).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
// 한 사람이 10분에 5건까지 — 장난 예약으로 숙소가 곤란해지지 않게.
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const { data, error } = await db.from("lodging_bookings").select(BOOKING_COLUMNS).eq("guest_auth_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, bookings: [] });
    return fail(error.message, 500);
  }
  return NextResponse.json({ ready: true, bookings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 예약할 수 있어요.", 401);
  if (!allow(user.id)) return fail("예약을 너무 자주 넣었어요. 잠시 후 다시 시도해 주세요.", 429);
  const cleaned = cleanStayRequest(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const r = cleaned.request;

  const { data: roomRow, error: roomError } = await db.from("lodging_rooms").select("place_id, is_active").eq("id", r.roomId).maybeSingle();
  if (roomError) return fail(isMissingSchema(roomError) ? "지금은 예약을 받을 수 없어요." : roomError.message, isMissingSchema(roomError) ? 503 : 500);
  if (!roomRow || !roomRow.is_active) return fail("예약할 수 없는 객실이에요.", 404);
  const placeId = Number(roomRow.place_id);
  const { profile, rooms } = await getLodging(placeId, true);
  const room = rooms.find((x) => x.id === r.roomId);
  if (!room) return fail("예약할 수 없는 객실이에요.", 404);

  const petProblem = petsAllowed(profile, room, r.pets);
  if (petProblem) return fail(petProblem, 400);
  const days = await roomDays(r.roomId, r.checkIn, r.checkOut).catch(() => []);
  const q = quoteStay(room, profile?.pet_fee ?? null, days, r.checkIn, r.checkOut, r.guests, r.pets.length);
  if ("error" in q) return fail(q.error, 400);
  if ((await confirmedOverlaps(r.roomId, r.checkIn, r.checkOut)).length > 0) return fail("그 날짜에는 이미 예약이 찼어요. 다른 날짜를 골라 주세요.", 409);

  const { count } = await db.from("lodging_bookings").select("id", { count: "exact", head: true })
    .eq("place_id", placeId).eq("guest_auth_user_id", user.id).in("status", ["requested", "confirmed"]).gte("check_out", kstToday());
  if ((count ?? 0) >= OPEN_STAYS_PER_GUEST) return fail("이 숙소에 진행 중인 예약이 이미 있어요. 먼저 그 예약을 확인해 주세요.", 409);

  const { data, error } = await db.from("lodging_bookings").insert([{
    place_id: placeId, room_id: room.id, room_name: room.name, guest_auth_user_id: user.id,
    guest_name: r.name, guest_phone: r.phone, check_in: r.checkIn, check_out: r.checkOut, nights: q.nights.length, guests: r.guests,
    pets: r.pets, price_detail: { nights: q.nights, roomTotal: q.roomTotal, extraGuestTotal: q.extraGuestTotal, petTotal: q.petTotal },
    total: q.total, payment: "onsite", memo: r.memo,
  }]).select(BOOKING_COLUMNS).single();
  if (error) return fail(error.message, 500);

  // 숙소 사장님 기기로 알림 — 응답을 보낸 뒤에 보내서 손님을 기다리게 하지 않습니다. 알림마다 꼬리표가 달라 한 건씩 쌓입니다.
  after(() => sendOwnerPush(placeId, {
    title: "멍멍! 새 숙박 예약 요청이 들어왔어요",
    body: `${r.name}님 · ${room.name} · ${r.checkIn.slice(5).replace("-", "/")}~${r.checkOut.slice(5).replace("-", "/")} ${q.nights.length}박 · ${r.guests}명·반려동물 ${r.pets.length}마리 · ${won(q.total)}\n눌러서 확정하거나 거절해 주세요.`,
    tag: `ggk-stay-${data.id}`,
    url: "/owner#stays",
  }));
  return NextResponse.json({ booking: data });
}

export async function PATCH(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);
  const { data: current } = await db.from("lodging_bookings").select("status, place_id, guest_name, room_name, check_in").eq("id", id).eq("guest_auth_user_id", user.id).maybeSingle();
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  if (!canChangeStay("guest", current.status as StayStatus, "cancelled_by_guest")) return fail("지금 상태에서는 취소할 수 없어요.", 409);
  if (current.check_in <= kstToday()) return fail("체크인 날부터는 앱에서 취소할 수 없어요. 숙소에 직접 연락해 주세요.", 409);

  const { data, error } = await db.from("lodging_bookings")
    .update({ status: "cancelled_by_guest", updated_at: new Date().toISOString() })
    .eq("id", id).eq("guest_auth_user_id", user.id).eq("status", current.status)
    .select(BOOKING_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  after(() => sendOwnerPush(Number(current.place_id), {
    title: "숙박 예약이 취소됐어요",
    body: `${current.guest_name}님 · ${current.room_name} · ${String(current.check_in).slice(5).replace("-", "/")} 체크인 예약을 손님이 취소했어요.`,
    tag: `ggk-stay-${id}`,
    url: "/owner#stays",
  }));
  return NextResponse.json({ booking: data });
}
