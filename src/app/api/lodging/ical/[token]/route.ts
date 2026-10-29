import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";
import { buildIcal } from "@/lib/ical";
import { kstToday } from "@/lib/lodgingBooking";

// GET /api/lodging/ical/{토큰}.ics — 객실 하나의 같이가개 달력(내보내기)
//   다른 예약 사이트(에어비앤비·부킹닷컴 등)의 "달력 가져오기"에 이 주소를 넣으면, 같이가개 예약(확정·대기)과
//   사장님이 막은 날이 그쪽에서도 자동으로 막힙니다. 토큰은 사장님 센터 "숙소·객실 → 달력 연동"에서 만들어집니다.
//   손님 이름·연락처는 넣지 않습니다(날짜만).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{32}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const { data: room } = await db.from("lodging_rooms").select("id, name").eq("ical_export_token", token).maybeSingle();
  if (!room) return new NextResponse("Not found", { status: 404 });
  const today = kstToday();
  const [{ data: stays }, { data: closed }] = await Promise.all([
    db.from("lodging_bookings").select("id, check_in, check_out").eq("room_id", room.id).in("status", ["requested", "confirmed"]).gte("check_out", today).limit(1000),
    db.from("lodging_room_days").select("day").eq("room_id", room.id).eq("closed", true).gte("day", today).limit(1000),
  ]);
  const body = buildIcal(`같이가개 · ${room.name}`, (stays ?? []) as { id: number; check_in: string; check_out: string }[], (closed ?? []).map((d) => String(d.day)));
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
