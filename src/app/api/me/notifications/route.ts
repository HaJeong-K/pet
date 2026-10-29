import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";

// 내 알림함(손님) — scripts/sql/lodging-operations.sql
//   GET  → 최근 알림 50개 + 안 읽은 수(?count=1 이면 안 읽은 수만 — 아래 탭바 빨간 숫자)
//   POST { all: true } 또는 { id } → 읽음 표시

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const unreadQuery = db.from("user_notifications").select("id", { count: "exact", head: true }).eq("auth_user_id", user.id).is("read_at", null);
  if (req.nextUrl.searchParams.get("count")) {
    const { count, error } = await unreadQuery;
    return NextResponse.json({ unread: error ? 0 : count ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const [{ data, error }, { count }] = await Promise.all([
    db.from("user_notifications").select("id, kind, title, body, url, read_at, created_at").eq("auth_user_id", user.id).order("created_at", { ascending: false }).limit(50),
    unreadQuery,
  ]);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, notifications: [], unread: 0 }) : fail(error.message, 500);
  return NextResponse.json({ ready: true, notifications: data ?? [], unread: count ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const body = (await req.json().catch(() => null)) as { all?: boolean; id?: number } | null;
  let q = db.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("auth_user_id", user.id).is("read_at", null);
  if (!body?.all) {
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return fail("알림을 찾을 수 없어요.", 400);
    q = q.eq("id", id);
  }
  const { error } = await q;
  if (error && !isMissingSchema(error)) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
