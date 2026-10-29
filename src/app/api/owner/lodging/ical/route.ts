import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { lodgingOwnerContext } from "@/lib/server/lodgingStore";
import { syncRoomIcal } from "@/lib/server/lodgingIcal";
import { cleanIcalUrl } from "@/lib/ical";
import { kstToday } from "@/lib/lodgingBooking";
import { siteUrl } from "@/lib/siteUrl";

// 사장님 객실 달력 연동(iCal) — 중복 예약 방지
//   GET  ?roomId=        → 가져오기 주소·내보내기 주소(처음이면 만듦)·마지막 동기화·막힌 밤 수
//   PUT  { roomId, importUrl } → 다른 사이트 달력 주소 저장(비우면 연동 해제) 후 바로 동기화
//   POST { roomId }      → 지금 동기화

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NOT_READY = "달력 연동은 준비 중이에요. 잠시 뒤 다시 해 주세요.";

async function roomOf(placeId: number, roomId: number) {
  return db.from("lodging_rooms").select("id, name, ical_import_url, ical_export_token, ical_synced_at, ical_error").eq("id", roomId).eq("place_id", placeId).maybeSingle();
}

async function describe(placeId: number, roomId: number) {
  let { data: room, error } = await roomOf(placeId, roomId);
  if (error) return { error: isMissingSchema(error) ? NOT_READY : error.message, status: isMissingSchema(error) ? 503 : 500 };
  if (!room) return { error: "객실을 찾을 수 없어요.", status: 404 };
  if (!room.ical_export_token) {
    const token = randomBytes(16).toString("hex");
    await db.from("lodging_rooms").update({ ical_export_token: token }).eq("id", roomId);
    room = { ...room, ical_export_token: token };
  }
  const { count } = await db.from("lodging_ical_blocks").select("day", { count: "exact", head: true }).eq("room_id", roomId).gte("day", kstToday());
  return {
    importUrl: room.ical_import_url ?? null,
    exportUrl: `${siteUrl}/api/lodging/ical/${room.ical_export_token}.ics`,
    syncedAt: room.ical_synced_at ?? null,
    error: room.ical_error ?? null,
    blockedNights: count ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const roomId = Number(req.nextUrl.searchParams.get("roomId"));
  if (!Number.isInteger(roomId) || roomId <= 0) return fail("객실을 골라 주세요.", 400);
  const out = await describe(ctx.placeId, roomId);
  return "status" in out ? fail(out.error!, out.status!) : NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = (await req.json().catch(() => null)) as { roomId?: unknown; importUrl?: unknown } | null;
  const roomId = Number(body?.roomId);
  if (!Number.isInteger(roomId) || roomId <= 0) return fail("객실을 골라 주세요.", 400);
  const cleaned = cleanIcalUrl(body?.importUrl);
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { data: room, error } = await roomOf(ctx.placeId, roomId);
  if (error) return fail(isMissingSchema(error) ? NOT_READY : error.message, isMissingSchema(error) ? 503 : 500);
  if (!room) return fail("객실을 찾을 수 없어요.", 404);
  await db.from("lodging_rooms").update({ ical_import_url: cleaned.url, ...(cleaned.url ? {} : { ical_error: null }) }).eq("id", roomId);
  const result = await syncRoomIcal(roomId, cleaned.url);
  const out = await describe(ctx.placeId, roomId);
  return NextResponse.json({ ...out, result });
}

export async function POST(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = (await req.json().catch(() => null)) as { roomId?: unknown } | null;
  const roomId = Number(body?.roomId);
  const { data: room } = await roomOf(ctx.placeId, roomId);
  if (!room) return fail("객실을 찾을 수 없어요.", 404);
  if (!room.ical_import_url) return fail("먼저 다른 예약 사이트의 달력 주소를 넣어 주세요.", 400);
  const result = await syncRoomIcal(roomId, room.ical_import_url);
  const out = await describe(ctx.placeId, roomId);
  return NextResponse.json({ ...out, result });
}
