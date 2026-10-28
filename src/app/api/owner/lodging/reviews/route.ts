import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { lodgingOwnerContext } from "@/lib/server/lodgingStore";
import { notifyAdmin } from "@/lib/server/notify";
import { cleanReviewReport, OWNER_REPLY_MAX, REVIEW_REPORT_REASONS } from "@/lib/lodgingReviews";

// 숙소 사장님의 숙박 후기 관리(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId=) — scripts/sql/lodging-guest-review-reports.sql
//   GET   → 내 숙소의 숙박 후기(삭제된 것 제외) + 답글·신고 상태
//   PATCH { id, reply }          → 사장님 답글 달기·고치기(빈 글이면 답글 지우기)
//   POST  { id, reason, detail } → 후기 신고 — 관리자가 검토해 유지·가리기·삭제(관리자에게 바로 알림)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const BASE = "id, room_name, guest_display_name, rating, clean_rating, service_rating, pet_rating, content, pets_summary, nights, owner_reply, owner_replied_at, hidden, created_at";
const REPORT = "report_status, report_reason, report_detail, reported_at, report_decided_at, report_admin_note";

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  let reportReady = true;
  let { data, error } = await db.from("lodging_reviews").select(`${BASE}, ${REPORT}`).eq("place_id", ctx.placeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  if (error && isMissingSchema(error)) {
    reportReady = false;
    ({ data, error } = await db.from("lodging_reviews").select(BASE).eq("place_id", ctx.placeId).order("created_at", { ascending: false }).limit(300) as never);
  }
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, reviews: [] }) : fail(error.message, 500);
  return NextResponse.json({ ready: true, reportReady, reviews: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = (await req.json().catch(() => null)) as { id?: unknown; reply?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("후기를 찾을 수 없어요.", 400);
  if (typeof body?.reply !== "string") return fail("답글을 적어 주세요.", 400);
  const reply = body.reply.trim().slice(0, OWNER_REPLY_MAX) || null;
  const { data, error } = await db.from("lodging_reviews").update({ owner_reply: reply, owner_replied_at: reply ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("place_id", ctx.placeId).select("id, owner_reply, owner_replied_at").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("후기를 찾을 수 없어요.", 404);
  return NextResponse.json({ review: data });
}

export async function POST(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("후기를 찾을 수 없어요.", 400);
  const report = cleanReviewReport(body);
  if ("error" in report) return fail(report.error, 400);

  const { data: current, error: findError } = await db.from("lodging_reviews").select("id, content, report_status").eq("id", id).eq("place_id", ctx.placeId).is("deleted_at", null).maybeSingle();
  if (findError) return isMissingSchema(findError) ? fail("후기 신고는 준비 중이에요.", 503) : fail(findError.message, 500);
  if (!current) return fail("후기를 찾을 수 없어요.", 404);
  if (current.report_status === "pending") return fail("이미 신고해서 검토 중인 후기예요.", 409);
  if (current.report_status) return fail("이미 검토를 마친 후기예요. 다시 확인이 필요하면 고객센터로 문의해 주세요.", 409);

  const now = new Date().toISOString();
  const { error } = await db.from("lodging_reviews").update({ report_status: "pending", report_reason: report.reason, report_detail: report.detail, reported_at: now, updated_at: now }).eq("id", id);
  if (error) return fail(error.message, 500);
  const label = REVIEW_REPORT_REASONS.find((r) => r.id === report.reason)?.label;
  after(() => notifyAdmin({ title: "🚩 숙박 후기 신고", lines: [`후기 #${id} · ${label}`, report.detail?.slice(0, 80), `"${String(current.content).slice(0, 60)}"`], path: "/admin/stays" }));
  return NextResponse.json({ ok: true });
}
