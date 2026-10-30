import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { roomDays } from "@/lib/server/lodgingStore";
import { ensureFreshIcal } from "@/lib/server/lodgingIcal";
import { daysBetween, isDay, nightsOf, nightPrice, STAY_HOLD_MS } from "@/lib/lodgingBooking";

// GET /api/lodging/availability?roomId=&from=&to=  — 손님용 객실 달력(로그인 없이 누구나)
// 날짜마다 { day, price, closed, booked } — 막은 날(closed)이나 예약이 잡힌 날(booked: 확정, 또는 24시간 안의 확인 대기)은 예약할 수 없습니다.
// 다른 예약 사이트 달력은 5분 넘게 지났으면 먼저 새로 받습니다(느리면 2.5초만 기다리고 받아 둔 값으로 보여 줌).
// 손님 이름 같은 예약 내용은 보내지 않고 "찬 날"인지만 알려 줍니다.

const RANGE_MAX = 93;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const roomId = Number(p.get("roomId"));
  const from = p.get("from"), to = p.get("to");
  if (!Number.isInteger(roomId) || roomId <= 0 || !isDay(from) || !isDay(to) || daysBetween(from, to) < 1 || daysBetween(from, to) > RANGE_MAX) {
    return NextResponse.json({ error: "기간을 다시 골라 주세요." }, { status: 400 });
  }
  const roomOf = (columns: string) => db.from("lodging_rooms").select(columns).eq("id", roomId).maybeSingle<{ base_price: number; weekend_price: number | null; weekday_prices?: (number | null)[] | null; is_active: boolean }>();
  let { data: room, error: roomError } = await roomOf("base_price, weekend_price, weekday_prices, is_active");
  // 요일별 요금 칸(scripts/sql/lodging-fees-extras.sql) 실행 전이면 그 칸 없이
  if (roomError && isMissingSchema(roomError)) ({ data: room, error: roomError } = await roomOf("base_price, weekend_price, is_active"));
  if (roomError && isMissingSchema(roomError)) return NextResponse.json({ ready: false, days: [] });
  if (!room || !room.is_active) return NextResponse.json({ error: "객실을 찾을 수 없어요." }, { status: 404 });
  try {
    await Promise.race([ensureFreshIcal(roomId).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
    const holdSince = new Date(Date.now() - STAY_HOLD_MS).toISOString();
    const [changed, confirmed] = await Promise.all([
      roomDays(roomId, from, to, { withIcal: true }),
      db.from("lodging_bookings").select("check_in, check_out").eq("room_id", roomId).or(`status.eq.confirmed,and(status.eq.requested,created_at.gte.${holdSince}),status.eq.pending_payment`).lt("check_in", to).gt("check_out", from),
    ]);
    if (confirmed.error) throw confirmed.error;
    const byDay = new Map(changed.map((d) => [d.day, d]));
    const booked = new Set((confirmed.data ?? []).flatMap((b) => nightsOf(b.check_in, b.check_out)));
    const days = nightsOf(from, to).map((day) => {
      const override = byDay.get(day) ?? null;
      return { day, price: nightPrice(room, day, override), closed: !!override?.closed, booked: booked.has(day) };
    });
    return NextResponse.json({ ready: true, days }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (isMissingSchema(err)) return NextResponse.json({ ready: false, days: [] });
    return NextResponse.json({ error: err.message || "불러오지 못했어요." }, { status: 500 });
  }
}
