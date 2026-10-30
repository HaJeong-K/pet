import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, ownerContext } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";

// 사장님의 쇼핑 후기 관리
//   GET   → 우리 가게 후기
//   PATCH → { id, reply } 답글 / { id, report } 신고(관리자가 가림 여부를 판단)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const COLUMNS = "id, display_name, order_type, rating, content, owner_reply, reported_at, report_reason, hidden, created_at";

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { data, error } = await db.from("store_reviews").select(COLUMNS).eq("place_id", ctx.placeId).order("created_at", { ascending: false }).limit(200);
  if (error) return isMissingSchema(error) ? NextResponse.json({ reviews: [] }) : fail(error.message, 500);
  return NextResponse.json({ reviews: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("후기를 찾을 수 없어요.", 400);
  const now = new Date().toISOString();
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 500) : null;
  const report = typeof body?.report === "string" ? body.report.trim().slice(0, 300) : null;
  if (!reply && !report) return fail("내용을 적어 주세요.", 400);
  const { data, error } = await db.from("store_reviews")
    .update(reply ? { owner_reply: reply, owner_reply_at: now } : { reported_at: now, report_reason: report })
    .eq("id", id).eq("place_id", ctx.placeId).select(COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("후기를 찾을 수 없어요.", 404);
  if (report) after(() => notifyAdmin({ title: "🚩 쇼핑 후기 신고", lines: [`후기 #${id}`, report.slice(0, 80)], path: "/admin/stays" }));
  return NextResponse.json({ review: data });
}
