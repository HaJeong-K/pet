import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, ownerContext } from "@/lib/server/ownerStore";
import { cleanNotice, NOTICES_PER_PLACE_MAX, sortNotices, type PlaceNotice } from "@/lib/placeNotices";

// 사장님의 가게 공지(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게) — scripts/sql/place-notices.sql
//   GET    → 공지 목록(지운 것 제외)
//   POST   { title, content, pinned } → 새 공지
//   PATCH  { id, title?, content?, pinned? } → 고치기·고정/해제
//   DELETE ?id= → 지우기(손님에게 안 보이게 하고 기록은 남김)
// 대표(고정) 공지는 한 가게에 하나 — 새로 고정하면 예전 고정은 풀립니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const COLUMNS = "id, title, content, pinned, created_at, updated_at";
const NOT_READY = "공지 기능을 준비 중이에요. 잠시 뒤 다시 해 주세요.";

async function unpinOthers(placeId: number, keepId: number) {
  await db.from("place_notices").update({ pinned: false }).eq("place_id", placeId).eq("pinned", true).neq("id", keepId);
}

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { data, error } = await db.from("place_notices").select(COLUMNS).eq("place_id", ctx.placeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(NOTICES_PER_PLACE_MAX);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, notices: [] }) : fail(error.message, 500);
  return NextResponse.json({ ready: true, notices: sortNotices((data ?? []) as PlaceNotice[]) });
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanNotice(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { count, error: countError } = await db.from("place_notices").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).is("deleted_at", null);
  if (countError) return isMissingSchema(countError) ? fail(NOT_READY, 503) : fail(countError.message, 500);
  if ((count ?? 0) >= NOTICES_PER_PLACE_MAX) return fail(`공지는 ${NOTICES_PER_PLACE_MAX}개까지 둘 수 있어요. 오래된 공지를 지운 뒤 올려 주세요.`, 409);
  const { data, error } = await db.from("place_notices").insert({ place_id: ctx.placeId, author_auth_user_id: ctx.userId, ...cleaned.notice }).select(COLUMNS).single();
  if (error) return fail(error.message, 500);
  if (data.pinned) await unpinOthers(ctx.placeId, data.id);
  return NextResponse.json({ notice: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("공지를 찾을 수 없어요.", 400);
  const cleaned = cleanNotice(body, true);
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { data, error } = await db.from("place_notices").update({ ...cleaned.notice, updated_at: new Date().toISOString() })
    .eq("id", id).eq("place_id", ctx.placeId).is("deleted_at", null).select(COLUMNS).maybeSingle();
  if (error) return isMissingSchema(error) ? fail(NOT_READY, 503) : fail(error.message, 500);
  if (!data) return fail("공지를 찾을 수 없어요.", 404);
  if (data.pinned) await unpinOthers(ctx.placeId, data.id);
  return NextResponse.json({ notice: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("공지를 찾을 수 없어요.", 400);
  const { data, error } = await db.from("place_notices").update({ deleted_at: new Date().toISOString(), pinned: false })
    .eq("id", id).eq("place_id", ctx.placeId).is("deleted_at", null).select("id").maybeSingle();
  if (error) return isMissingSchema(error) ? fail(NOT_READY, 503) : fail(error.message, 500);
  if (!data) return fail("공지를 찾을 수 없어요.", 404);
  return NextResponse.json({ ok: true });
}
