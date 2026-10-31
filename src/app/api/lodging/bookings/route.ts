import { RULE_AGREEMENT_LABEL, RULE_SANCTIONS, STAY_CONSENT_VERSION } from "@/lib/lodgingConsents";
import { canReviewStay } from "@/lib/lodgingReviews";
import { ensureFreshIcal } from "@/lib/server/lodgingIcal";
import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { BOOKING_COLUMNS, BOOKING_FULL_COLUMNS, getLodging, heldOverlaps, roomDays } from "@/lib/server/lodgingStore";
import { applyCancel, confirmStay, expireStaleRequests, MONEY_COLUMNS, NEED_SETTLEMENT_SQL, type MoneyBooking } from "@/lib/server/lodgingMoney";
import { availableStamps, releaseStamps, spendStamps } from "@/lib/server/memoryStamps";
import { STAMPS_ENABLED, stampDiscount } from "@/lib/memoryStamps";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { notifyAdmin } from "@/lib/server/notify";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { canChangeStay, cleanStayRequest, kstToday, OPEN_STAYS_PER_GUEST, petsAllowed, petsNightlyTotal, quoteStay, stayDayLabel } from "@/lib/lodgingBooking";
import { cancelOutcome, refundSchedule, type PeakPeriod } from "@/lib/lodgingPolicy";
import { won } from "@/lib/ownerPlans";
import { paymentInfoOf, paymentsEnabled } from "@/lib/server/payments";
import { missingPetAcks, petRequirementItems } from "@/lib/petRequirements";

// 손님의 숙박 예약 — 로그인한 회원만(「같이가개 숙소 입점 계약서」 제8~15조).
//   GET   → 내 숙박 예약 목록 + 숙소 이름 + 지금 취소하면 돌려받는 금액·날짜별 환불 안내
//   POST  → 예약 { roomId, checkIn, checkOut, guests, pets, name, phone, memo, agreed }
//           손님은 전액을 미리 결제합니다. 'pending_payment'로 만들고 needsPayment를 돌려주면 화면이 결제창을 엽니다.
//           결제를 마쳐야 사장님에게 보이고 알림이 갑니다(/api/payments/confirm). 결제 키를 넣기 전에는 결제 단계 없이 접수됩니다.
//   PATCH → { id, action }
//           "cancel"  : 내 예약 취소. 확정 전이면 전액, 확정 뒤면 소비자분쟁해결기준(별표 1)대로 환불(이용일 당일까지). 카드 결제는 바로 환불됩니다
//           "abandon" : 결제하지 않은 예약 지우기
//           "confirm" : 이용 확정(체크아웃 날부터). 누르지 않으면 3일 뒤 자동 확정(매일 새벽 작업)
//           "issue"   : 문제 있어요 { kind, detail } — 체크인 날부터 이용 확정 전까지. 확정·정산이 멈추고 관리자가 판단
// 요금은 손님이 보낸 값이 아니라 숙소가 올린 요금으로 다시 계산합니다. 동반 규정에 맞지 않거나 막은 날·이미 찬 날이 끼면 받지 않습니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const FULL_MESSAGE = "그 사이 다른 손님이 먼저 예약했어요. 다른 날짜를 골라 주세요.";
// 한 사람이 10분에 5건까지 — 장난 예약으로 숙소가 곤란해지지 않게.
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });
const ISSUE_KINDS: Record<string, string> = {
  refused: "반려동물과 함께 입실을 거부당했어요",
  different_room: "예약한 객실·시설과 달라요",
  pet_condition: "반려동물 동반 조건이 안내와 달라요",
  facility: "시설·위생에 문제가 있었어요",
  extra_charge: "현장에서 추가 요금을 요구받았어요",
  other: "기타",
};
const shortDay = (day: string) => stayDayLabel(day);

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  let { data, error } = await db.from("lodging_bookings").select(BOOKING_FULL_COLUMNS).eq("guest_auth_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  let settlementReady = true;
  if (error && isMissingSchema(error)) {
    settlementReady = false;
    ({ data, error } = await db.from("lodging_bookings").select(BOOKING_COLUMNS).eq("guest_auth_user_id", user.id).order("created_at", { ascending: false }).limit(100) as never);
  }
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, bookings: [] });
    return fail(error.message, 500);
  }
  const rows = (data ?? []) as Record<string, any>[];
  const placeIds = [...new Set(rows.map((b) => Number(b.place_id)))];
  const bookingIds = rows.map((b) => Number(b.id));
  const [{ data: places }, { data: profiles }, { data: reviewed }, payments] = await Promise.all([
    placeIds.length ? db.from("places").select("id, name, address, phone").in("id", placeIds) : Promise.resolve({ data: [] as any[] }),
    placeIds.length ? db.from("lodging_profiles").select("place_id, check_in, check_out, peak_periods, refund_policy").in("place_id", placeIds) : Promise.resolve({ data: [] as any[] }),
    // 이미 숙박 후기를 남긴 예약(표가 없으면 빈 목록)
    bookingIds.length ? db.from("lodging_reviews").select("booking_id").in("booking_id", bookingIds) : Promise.resolve({ data: [] as any[] }),
    paymentInfoOf("lodging", bookingIds).catch(() => new Map()),
  ]);
  const reviewedIds = new Set((reviewed ?? []).map((r) => Number(r.booking_id)));
  const today = kstToday();
  const bookings = rows.map((b) => {
    const place = (places ?? []).find((p) => Number(p.id) === Number(b.place_id));
    const profile = (profiles ?? []).find((p) => Number(p.place_id) === Number(b.place_id));
    const peak = (profile?.peak_periods ?? null) as PeakPeriod[] | null;
    const bookedOn = b.booked_on ?? kstToday(new Date(b.created_at).getTime());
    const open = b.status === "requested" || b.status === "confirmed";
    return {
      ...b,
      place: place ? { name: place.name, address: place.address, phone: place.phone } : null,
      payment: payments.get(Number(b.id)) ?? null,
      checkInTime: profile?.check_in ?? null, checkOutTime: profile?.check_out ?? null,
      // 지금 취소하면(확정 전이면 전액)
      cancelNow: open && today <= b.check_in ? cancelOutcome(b.total, b.status === "requested" ? "not_confirmed" : "guest", { checkIn: b.check_in, bookedOn, bookedAt: b.created_at, cancelOn: today, peakPeriods: peak }) : null,
      schedule: open ? refundSchedule(b.total, b.check_in, bookedOn, peak).filter((r) => r.until >= today) : [],
      canConfirm: settlementReady && b.status === "confirmed" && today >= b.check_out && b.issue_status !== "open",
      canReportIssue: settlementReady && b.status === "confirmed" && today >= b.check_in && b.issue_status === "none",
      // 숙박 후기: 체크아웃 날부터, 확정·완료 예약, 아직 안 남겼을 때
      canReview: canReviewStay(b as { status: string; check_out: string }, today) && !reviewedIds.has(Number(b.id)),
      reviewed: reviewedIds.has(Number(b.id)),
    };
  });
  return NextResponse.json({ ready: true, settlementReady, issueKinds: ISSUE_KINDS, bookings });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 예약할 수 있어요.", 401);
  if (!allow(user.id)) return fail("예약을 너무 자주 넣었어요. 잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => null);
  // 이용 규칙·취소 환불·개인정보 수집/제공·만 14세 동의는 cleanStayRequest가 모두 확인합니다
  const cleaned = cleanStayRequest(body);
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
  // 숙소가 정한 입실 조건을 손님이 항목마다 확인했는지 — 확인 기록은 동의 기록과 함께 남깁니다
  if (missingPetAcks(profile?.pet_requirements, body?.petAcks).length > 0) return fail("숙소의 입실 조건을 모두 확인해 주세요.", 400);
  if (body?.ruleAgreed !== true) return fail("숙소 규정을 읽고 준수 동의에 체크해 주세요.", 400);
  const petConditions = petRequirementItems(profile?.pet_requirements).map((i) => i.text);
  // 다른 예약 사이트에서 막 팔렸을 수 있으니 달력 연동을 항상 먼저 새로 받습니다
  await ensureFreshIcal(r.roomId, 0).catch(() => {});
  // 24시간이 지난 확인 대기·20분 안에 결제하지 않은 예약은 먼저 풀어 줍니다
  await expireStaleRequests(r.roomId).catch(() => 0);
  // 같은 손님이 결제창을 닫고 다시 예약하는 경우 — 먼저 넣은 결제 대기 예약이 날짜를 막지 않게 지웁니다
  await db.from("lodging_bookings").delete().eq("room_id", r.roomId).eq("guest_auth_user_id", user.id).eq("status", "pending_payment");
  const days = await roomDays(r.roomId, r.checkIn, r.checkOut, { withIcal: true }).catch(() => []);
  // 반려동물 추가 요금은 마리마다(크기·종류별), 부가 옵션은 숙소가 정한 요금으로 다시 계산합니다
  const petNightly = petsNightlyTotal(profile, r.pets);
  const q = quoteStay(room, petNightly, days, r.checkIn, r.checkOut, r.guests, r.extras, profile?.extras ?? []);
  if ("error" in q) return fail(q.error, 400);
  if ((await heldOverlaps(r.roomId, r.checkIn, r.checkOut)).length > 0) return fail(FULL_MESSAGE, 409);

  const { count } = await db.from("lodging_bookings").select("id", { count: "exact", head: true })
    .eq("place_id", placeId).eq("guest_auth_user_id", user.id).in("status", ["requested", "confirmed"]).gte("check_out", kstToday());
  if ((count ?? 0) >= OPEN_STAYS_PER_GUEST) return fail("이 숙소에 진행 중인 예약이 이미 있어요. 먼저 그 예약을 확인해 주세요.", 409);

  // 즉시 확정 숙소는 결제와 함께 바로 확정됩니다(계약서 제8조 제3항).
  const { data: flags } = await db.from("lodging_profiles").select("instant_confirm").eq("place_id", placeId).maybeSingle();
  const instant = flags?.instant_confirm === true;
  const needsPayment = paymentsEnabled();
  // 추억 스탬프 할인 — 가진 개수·한도로 서버가 다시 계산합니다. 할인분은 같이가개가 부담합니다.
  const { used: stampsUsed, discount } = STAMPS_ENABLED && r.stamps > 0 ? stampDiscount(q.total, r.stamps, await availableStamps(user.id)) : { used: 0, discount: 0 };
  const base = {
    place_id: placeId, room_id: room.id, room_name: room.name, guest_auth_user_id: user.id,
    guest_name: r.name, guest_phone: r.phone, check_in: r.checkIn, check_out: r.checkOut, nights: q.nights.length, guests: r.guests,
    pets: r.pets, price_detail: { nights: q.nights, roomTotal: q.roomTotal, extraGuestTotal: q.extraGuestTotal, petTotal: q.petTotal, extras: q.extras, extrasTotal: q.extrasTotal, listTotal: q.total, stampCount: stampsUsed, stampDiscount: discount },
    total: q.total - discount, stamp_discount: discount, payment: "online", memo: r.memo, status: needsPayment ? "pending_payment" : instant ? "confirmed" : "requested", ...(instant && !needsPayment ? { decided_at: new Date().toISOString() } : {}),
  };
  // 이용자 정보·방문 수단·동의 기록(scripts/sql/lodging-guest-review-reports.sql)
  const guestInfo = {
    guest_email: r.email, stay_guest_name: r.stayGuestName, stay_guest_phone: r.stayGuestPhone,
    arrival_method: r.arrivalMethod, arrival_time: r.arrivalTime,
    payment_method: r.paymentMethod,
    cash_receipt: r.cashReceipt ? { ...r.cashReceipt, status: r.cashReceipt.type === "none" ? "not_requested" : "requested" } : null,
    consents: { version: STAY_CONSENT_VERSION, at: new Date().toISOString(), items: r.consents, petConditions, ruleAgreement: { label: RULE_AGREEMENT_LABEL, sanctions: RULE_SANCTIONS.map((x) => x.text), petRules: profile?.pet_rules ?? null, stayRules: profile?.stay_rules ?? null } },
  };
  let { data, error } = await db.from("lodging_bookings").insert([{ ...base, ...guestInfo, booked_on: kstToday(), payment_status: "unpaid" }]).select(BOOKING_COLUMNS).single();
  // 그 칸들이 아직 없으면 빼고 접수합니다
  if (error && isMissingSchema(error)) ({ data, error } = await db.from("lodging_bookings").insert([{ ...base, booked_on: kstToday(), payment_status: "unpaid" }]).select(BOOKING_COLUMNS).single());
  // 정산 칸(scripts/sql/lodging-settlement.sql) 실행 전이면 그 칸 없이 접수합니다
  if (error && isMissingSchema(error)) ({ data, error } = await db.from("lodging_bookings").insert([base]).select(BOOKING_COLUMNS).single());
  // 같은 날짜가 동시에 들어오면 DB 규칙이 한 건만 받습니다(lodging_bookings_no_overlap)
  if (error?.code === "23P01") return fail(FULL_MESSAGE, 409);
  if (error || !data) return fail(error?.message ?? "예약하지 못했어요.", 500);

  // 스탬프를 실제로 씁니다. 그 사이 개수가 모자라면(다른 기기에서 사용) 예약을 되돌립니다.
  if (stampsUsed > 0) {
    const spent = await spendStamps(user.id, Number(data.id), stampsUsed);
    if (spent < stampsUsed) {
      await releaseStamps(Number(data.id));
      await db.from("lodging_bookings").delete().eq("id", data.id);
      return fail("스탬프 개수가 바뀌었어요. 다시 확인해 주세요.", 409);
    }
  }

  // 결제가 끝나면 그때 숙소에 알립니다
  if (needsPayment) return NextResponse.json({ booking: data, needsPayment: true });

  // 달력 연동을 안 한 객실이면, 다른 사이트에서도 파는 경우 그쪽을 막아 달라고 알립니다
  const { data: icalRow } = await db.from("lodging_rooms").select("ical_import_url").eq("id", r.roomId).maybeSingle();
  const otherSiteNote = icalRow?.ical_import_url ? "" : "\n다른 예약 사이트에서도 파는 객실이면 그쪽 달력에서 이 날짜를 막아 주세요.";

  // 숙소 사장님 기기로 알림 — 응답을 보낸 뒤에 보내서 손님을 기다리게 하지 않습니다. 알림마다 꼬리표가 달라 한 건씩 쌓입니다.
  after(() => sendOwnerPush(placeId, {
    title: instant ? "멍멍! 새 숙박 예약이 확정됐어요" : "멍멍! 새 숙박 예약 요청이 들어왔어요",
    body: `${r.name}님 · ${room.name} · ${shortDay(r.checkIn)}~${shortDay(r.checkOut)} ${q.nights.length}박 · ${r.guests}명·반려동물 ${r.pets.length}마리 · ${won(q.total)}${instant ? "" : "\n24시간 안에 확정하거나 거절해 주세요."}${otherSiteNote}`,
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
  const action = body?.action ?? "cancel";
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);

  const { data: current, error: findError } = await db.from("lodging_bookings").select(`${MONEY_COLUMNS}, guest_name, room_name, issue_status, stay_confirmed_at`).eq("id", id).eq("guest_auth_user_id", user.id).maybeSingle();
  if (findError) return fail(isMissingSchema(findError) ? NEED_SETTLEMENT_SQL : findError.message, isMissingSchema(findError) ? 503 : 500);
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  const b = current as MoneyBooking & { guest_name: string; room_name: string; issue_status: string; stay_confirmed_at: string | null };
  const today = kstToday();
  const notifyOwner = (title: string, text: string) => after(() => sendOwnerPush(b.place_id, { title, body: `${b.guest_name}님 · ${b.room_name} · ${shortDay(b.check_in)} 체크인\n${text}`, tag: `ggk-stay-${id}`, url: "/owner#stays" }));

  if (action === "abandon") {
    if (b.status !== "pending_payment") return fail("결제하지 않은 예약만 지울 수 있어요.", 409);
    await db.from("lodging_bookings").delete().eq("id", id).eq("status", "pending_payment");
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (!canChangeStay("guest", b.status, "cancelled_by_guest")) return fail("지금 상태에서는 취소할 수 없어요.", 409);
    if (today > b.check_in) return fail("체크인 날이 지나 앱에서 취소할 수 없어요. 숙소에 직접 연락해 주세요.", 409);
    const done = await applyCancel(b, b.status === "requested" ? "not_confirmed" : "guest", "cancelled_by_guest", b.status);
    if (!done) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    notifyOwner("숙박 예약이 취소됐어요", done.outcome.penalty > 0 ? `손님이 취소했어요. 위약금 ${won(done.outcome.penalty)}은 정산해 드려요.` : "손님이 취소했어요(전액 환불).");
    return NextResponse.json({ booking: done.booking, refund: done.outcome.refund });
  }

  if (action === "confirm") {
    if (b.status !== "confirmed" || b.stay_confirmed_at) return fail("이용 확정할 수 있는 예약이 아니에요.", 409);
    if (today < b.check_out) return fail("체크아웃 날부터 이용 확정할 수 있어요.", 409);
    if (b.issue_status === "open") return fail("접수한 문제를 확인하고 있어요. 처리가 끝나면 알려 드릴게요.", 409);
    const booking = await confirmStay(b, "guest");
    if (!booking) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    return NextResponse.json({ booking });
  }

  if (action === "issue") {
    const kind = typeof body?.kind === "string" && ISSUE_KINDS[body.kind] ? body.kind : null;
    const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 600) : "";
    if (!kind) return fail("어떤 문제인지 골라 주세요.", 400);
    if (!detail) return fail("무슨 일이 있었는지 적어 주세요.", 400);
    if (b.status !== "confirmed" || b.stay_confirmed_at) return fail("이용 확정 전 예약만 문제를 접수할 수 있어요.", 409);
    if (today < b.check_in) return fail("체크인 날부터 접수할 수 있어요. 그 전에는 예약 취소를 이용해 주세요.", 409);
    if (b.issue_status !== "none") return fail("이미 접수한 문제가 있어요.", 409);
    const { data, error } = await db.from("lodging_bookings").update({
      issue_status: "open", issue_kind: kind, issue_detail: detail, issue_opened_at: new Date().toISOString(), payout_status: "held", updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "confirmed").eq("issue_status", "none").select(BOOKING_FULL_COLUMNS).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    notifyOwner("손님이 문제를 접수했어요", `${ISSUE_KINDS[kind]} — 사장님 화면에서 3영업일 안에 의견을 남겨 주세요.`);
    after(() => notifyAdmin({ title: "🚨 숙박 문제 접수", lines: [`예약 #${id} · ${b.room_name}`, ISSUE_KINDS[kind], detail.slice(0, 80)], path: "/admin/stays" }));
    return NextResponse.json({ booking: data });
  }

  return fail("요청이 올바르지 않아요.", 400);
}

