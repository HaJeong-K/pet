import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { lodgingOwnerContext, roomDays } from "@/lib/server/lodgingStore";
import { addDays, daysBetween, isDay, kstToday, BOOK_AHEAD_DAYS } from "@/lib/lodgingBooking";
import { ROOM_PRICE_MAX } from "@/lib/lodgingRules";

// 숙소 사장님의 예약 달력(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId= 로 지정한 숙소)
//   GET ?roomId=&from=&to=  → 그 기간의 바꾼 날(막은 날·날짜별 요금) + 겹치는 예약(확인 대기·확정)
//   PUT { roomId, days: ["2026-11-07", ...], closed?: boolean, price?: number | null }
//        → 고른 날들을 막거나(closed: true) 풀고(false), 1박 요금을 정하거나(price) 원래대로(null) 돌립니다.
//          아무것도 바꾸지 않은 날(막지 않음 + 요금 없음)은 줄을 지워 표를 깔끔하게 둡니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEED_SQL = "예약 달력을 준비하고 있어요. Supabase SQL 편집기에서 scripts/sql/lodging-bookings.sql을 실행해 주세요.";
const RANGE_MAX = 93;

/** 이 숙소의 객실인지 */
async function ownRoom(placeId: number, roomId: number) {
  const { data } = await db.from("lodging_rooms").select("id").eq("id", roomId).eq("place_id", placeId).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const p = req.nextUrl.searchParams;
  const roomId = Number(p.get("roomId"));
  const from = p.get("from"), to = p.get("to");
  if (!Number.isInteger(roomId) || !isDay(from) || !isDay(to) || daysBetween(from, to) < 1 || daysBetween(from, to) > RANGE_MAX) return fail("기간을 다시 골라 주세요.", 400);
  if (!(await ownRoom(ctx.placeId, roomId))) return fail("객실을 찾을 수 없어요.", 404);
  try {
    const [days, bookings] = await Promise.all([
      roomDays(roomId, from, to),
      db.from("lodging_bookings").select("id, guest_name, check_in, check_out, status").eq("room_id", roomId).in("status", ["requested", "confirmed"]).lt("check_in", to).gt("check_out", from),
    ]);
    if (bookings.error) throw bookings.error;
    return NextResponse.json({ ready: true, days, bookings: bookings.data ?? [] });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (isMissingSchema(err)) return NextResponse.json({ ready: false, days: [], bookings: [] });
    return fail(err.message || "불러오지 못했어요.", 500);
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const roomId = Number(body?.roomId);
  if (!Number.isInteger(roomId) || !(await ownRoom(ctx.placeId, roomId))) return fail("객실을 찾을 수 없어요.", 404);
  const today = kstToday();
  const last = addDays(today, BOOK_AHEAD_DAYS + 31);
  const picked: string[] = Array.isArray(body?.days) ? [...new Set((body.days as unknown[]).filter(isDay))] : [];
  if (picked.length === 0) return fail("바꿀 날짜를 골라 주세요.", 400);
  if (picked.length > RANGE_MAX) return fail(`한 번에 ${RANGE_MAX}일까지 바꿀 수 있어요.`, 400);
  if (picked.some((d) => d < today || d > last)) return fail("오늘부터 예약을 받는 기간 안의 날짜만 바꿀 수 있어요.", 400);
  const hasClosed = typeof body?.closed === "boolean";
  const hasPrice = body && "price" in body;
  if (!hasClosed && !hasPrice) return fail("무엇을 바꿀지 골라 주세요.", 400);
  let price: number | null = null;
  if (hasPrice && body.price != null && body.price !== "") {
    price = Number(body.price);
    if (!Number.isInteger(price) || price < 0 || price > ROOM_PRICE_MAX) return fail("요금을 다시 확인해 주세요.", 400);
  }

  try {
    const current = new Map((await roomDays(roomId, picked.reduce((a, b) => (a < b ? a : b)), addDays(picked.reduce((a, b) => (a > b ? a : b)), 1))).map((d) => [d.day, d]));
    const next = picked.map((day) => {
      const before = current.get(day);
      return { room_id: roomId, day, closed: hasClosed ? body.closed : before?.closed ?? false, price: hasPrice ? price : before?.price ?? null, updated_at: new Date().toISOString() };
    });
    const keep = next.filter((d) => d.closed || d.price != null);
    const drop = next.filter((d) => !d.closed && d.price == null).map((d) => d.day);
    if (keep.length) {
      const { error } = await db.from("lodging_room_days").upsert(keep, { onConflict: "room_id,day" });
      if (error) throw error;
    }
    if (drop.length) {
      const { error } = await db.from("lodging_room_days").delete().eq("room_id", roomId).in("day", drop);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, changed: picked.length });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return fail(isMissingSchema(err) ? NEED_SQL : err.message || "저장하지 못했어요.", isMissingSchema(err) ? 503 : 500);
  }
}
