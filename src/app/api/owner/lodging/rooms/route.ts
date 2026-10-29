import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getLodging, lodgingOwnerContext, ROOM_BASE_COLUMNS, ROOM_COLUMNS } from "@/lib/server/lodgingStore";
import type { RoomInput } from "@/lib/lodgingRules";

// 요일별 요금 칸(scripts/sql/lodging-fees-extras.sql) 실행 전이면 그 칸 없이 저장합니다(요일별 요금을 적었으면 안내)
const WEEKDAY_NOT_READY = "요일별 요금은 준비 중이에요. 잠시 뒤 다시 저장해 주세요.";
const withoutWeekday = ({ weekday_prices: _w, ...rest }: RoomInput) => rest;
import { ownImageUrl } from "@/lib/server/ownerImage";
import { cleanRoom, ROOMS_PER_PLACE_MAX } from "@/lib/lodgingRules";

// 숙소 사장님의 객실 관리(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId= 로 지정한 숙소)
//   POST   → 객실 추가 { name, room_type, description, base_price, weekend_price, std_guests, max_guests, extra_guest_fee, max_pets, images, amenities, is_active }
//   PATCH  → 객실 수정 { id, ...바꿀 값 }  또는 순서 바꾸기 { id, move: "up" | "down" }
//   DELETE → 객실 삭제 ?id=

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
/** 사진이 모두 이 숙소가 우리 보관함에 올린 것인지(바깥 주소를 그대로 싣지 않게) */
const ownImages = (placeId: number, images: string[]) => images.every((url) => ownImageUrl("lodging-images", placeId, url));

export async function POST(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanRoom(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  if (!ownImages(ctx.placeId, cleaned.room.images)) return fail("사진을 다시 올려 주세요.", 400);

  const { data: existing, error: countError } = await db.from("lodging_rooms").select("sort_order").eq("place_id", ctx.placeId);
  if (countError) return fail(isMissingSchema(countError) ? "객실 기능이 아직 준비되지 않았어요." : countError.message, isMissingSchema(countError) ? 503 : 500);
  if ((existing ?? []).length >= ROOMS_PER_PLACE_MAX) return fail(`객실은 ${ROOMS_PER_PLACE_MAX}개까지 올릴 수 있어요.`, 400);
  const sort_order = (existing ?? []).reduce((max, r) => Math.max(max, Number(r.sort_order) || 0), -1) + 1;

  const insert = (row: Record<string, unknown>, columns: string) => db.from("lodging_rooms").insert([{ place_id: ctx.placeId, ...row, sort_order }]).select(columns).single();
  let { data, error } = await insert(cleaned.room, ROOM_COLUMNS);
  if (error && isMissingSchema(error)) {
    if (cleaned.room.weekday_prices) return fail(WEEKDAY_NOT_READY, 503);
    ({ data, error } = await insert(withoutWeekday(cleaned.room), ROOM_BASE_COLUMNS));
  }
  if (error) return fail(error.message, 500);
  return NextResponse.json({ room: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("객실을 찾을 수 없어요.", 400);
  const { rooms } = await getLodging(ctx.placeId, false);

  // 순서 바꾸기 — 바로 위(아래) 객실과 자리를 맞바꾸고 번호를 처음부터 다시 매깁니다.
  if (body?.move === "up" || body?.move === "down") {
    const index = rooms.findIndex((r) => r.id === id);
    const other = index + (body.move === "up" ? -1 : 1);
    if (index < 0) return fail("객실을 찾을 수 없어요.", 404);
    if (other < 0 || other >= rooms.length) return NextResponse.json({ ok: true });
    const order = rooms.map((r) => r.id);
    [order[index], order[other]] = [order[other], order[index]];
    const results = await Promise.all(order.map((roomId, i) => db.from("lodging_rooms").update({ sort_order: i }).eq("id", roomId).eq("place_id", ctx.placeId)));
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(failed.error.message, 500);
    return NextResponse.json({ ok: true });
  }

  // 본인 숙소의 객실인지 확인한 뒤, 지금 값 위에 바꿀 값만 덮어 다시 다듬습니다.
  const current = rooms.find((r) => r.id === id);
  if (!current) return fail("객실을 찾을 수 없어요.", 404);
  const cleaned = cleanRoom({ ...current, ...body });
  if ("error" in cleaned) return fail(cleaned.error, 400);
  if (!ownImages(ctx.placeId, cleaned.room.images)) return fail("사진을 다시 올려 주세요.", 400);
  const update = (row: Record<string, unknown>, columns: string) => db.from("lodging_rooms").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("place_id", ctx.placeId).select(columns).single();
  let { data, error } = await update(cleaned.room, ROOM_COLUMNS);
  if (error && isMissingSchema(error)) {
    if (cleaned.room.weekday_prices) return fail(WEEKDAY_NOT_READY, 503);
    ({ data, error } = await update(withoutWeekday(cleaned.room), ROOM_BASE_COLUMNS));
  }
  if (error) return fail(error.message, 500);
  return NextResponse.json({ room: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("객실을 찾을 수 없어요.", 400);
  const { error } = await db.from("lodging_rooms").delete().eq("id", id).eq("place_id", ctx.placeId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ success: true });
}
