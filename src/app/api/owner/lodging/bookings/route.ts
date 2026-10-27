import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { BOOKING_COLUMNS, confirmedOverlaps, lodgingOwnerContext } from "@/lib/server/lodgingStore";
import { canChangeStay, type StayStatus } from "@/lib/lodgingBooking";

// 숙소 사장님의 숙박 예약 관리(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId= 로 지정한 숙소)
//   GET   → 최근 예약 목록(손님 이름·전화 포함 — 그 숙소의 사장님과 관리자만 볼 수 있음)
//           ?count=1 이면 확인을 기다리는 예약 수만(아래 탭바·메뉴의 알림 숫자용)
//   PATCH → 상태 바꾸기 { id, status, ownerNote }
//           확인 대기 → 확정 / 거절,  확정 → 이용 완료 / 노쇼 / 숙소 사정으로 취소
//           확정할 때 같은 객실에 이미 확정된 예약과 날짜가 겹치면 막습니다(이중 예약 방지).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const LIST_LIMIT = 300;

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (req.nextUrl.searchParams.get("count")) {
    const { count, error } = await db.from("lodging_bookings").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("status", "requested");
    // 표가 아직 없거나 세지 못하면 0으로(알림 숫자가 화면을 막으면 안 됩니다)
    return NextResponse.json({ waiting: error ? 0 : count ?? 0 });
  }
  const { data, error } = await db.from("lodging_bookings").select(BOOKING_COLUMNS)
    .eq("place_id", ctx.placeId).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, bookings: [] });
    return fail(error.message, 500);
  }
  return NextResponse.json({ ready: true, bookings: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const next = body?.status as StayStatus;
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);

  const { data: current, error: findError } = await db.from("lodging_bookings").select("status, room_id, check_in, check_out").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
  if (findError) return fail(findError.message, 500);
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  if (!canChangeStay("owner", current.status as StayStatus, next)) return fail("지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로 고쳐 주세요.", 409);
  if (next === "confirmed") {
    const overlaps = await confirmedOverlaps(Number(current.room_id), current.check_in, current.check_out, id);
    if (overlaps.length > 0) return fail("같은 객실에 이미 확정된 예약과 날짜가 겹쳐요. 날짜를 확인해 주세요.", 409);
  }
  const ownerNote = typeof body?.ownerNote === "string" && body.ownerNote.trim() ? body.ownerNote.trim().slice(0, 200) : null;
  const now = new Date().toISOString();
  const { data, error } = await db.from("lodging_bookings")
    .update({ status: next, ...(ownerNote ? { owner_note: ownerNote } : {}), ...(current.status === "requested" ? { decided_at: now } : {}), updated_at: now })
    // 그 사이 손님이 취소했을 수 있으니, 방금 확인한 상태일 때만 바꿉니다.
    .eq("id", id).eq("place_id", ctx.placeId).eq("status", current.status)
    .select(BOOKING_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  return NextResponse.json({ booking: data });
}
