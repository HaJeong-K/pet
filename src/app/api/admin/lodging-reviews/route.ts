import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { REVIEW_ADMIN_ACTIONS, type ReviewAdminAction } from "@/lib/lodgingReviews";

// 관리자 "숙박 예약 → 후기 신고" — 숙소 사장님이 신고한 숙박 후기를 검토합니다(scripts/sql/lodging-guest-review-reports.sql)
//   GET  → 신고된 후기(검토 중 먼저, 그다음 최근 처리) + 숙소 이름
//   POST { id, action: keep | hide | delete, note, ban } → 유지 / 가리기(손님에게 안 보임) / 삭제(기록은 남김)
//        ban이면 작성자의 숙박 후기 작성을 막습니다(lodging_review_bans).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const { data, error } = await db.from("lodging_reviews")
    .select("id, place_id, room_name, guest_auth_user_id, guest_display_name, rating, content, owner_reply, hidden, created_at, report_status, report_reason, report_detail, reported_at, report_decided_at, report_admin_note")
    .not("report_status", "is", null).order("reported_at", { ascending: false }).limit(200);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, reports: [] }) : fail(error.message, 500);
  const rows = data ?? [];
  const placeIds = [...new Set(rows.map((r) => r.place_id))];
  const userIds = [...new Set(rows.map((r) => r.guest_auth_user_id))];
  const [{ data: places }, { data: bans }] = await Promise.all([
    placeIds.length ? db.from("places").select("id, name").in("id", placeIds) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    userIds.length ? db.from("lodging_review_bans").select("auth_user_id").in("auth_user_id", userIds) : Promise.resolve({ data: [] as { auth_user_id: string }[] }),
  ]);
  const nameOf = new Map((places ?? []).map((p) => [Number(p.id), p.name as string]));
  const banned = new Set((bans ?? []).map((b) => b.auth_user_id));
  const reports = rows
    .map(({ guest_auth_user_id, ...r }) => ({ ...r, place_name: nameOf.get(Number(r.place_id)) ?? null, writer_banned: banned.has(guest_auth_user_id) }))
    .sort((a, b) => Number(b.report_status === "pending") - Number(a.report_status === "pending"));
  return NextResponse.json({ ready: true, reports });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => null)) as { id?: unknown; action?: unknown; note?: unknown; ban?: unknown } | null;
  const id = Number(body?.id);
  const action = REVIEW_ADMIN_ACTIONS.find((a) => a === body?.action) as ReviewAdminAction | undefined;
  if (!Number.isInteger(id) || id <= 0 || !action) return fail("처리할 내용을 다시 확인해 주세요.", 400);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  if (action !== "keep" && !note) return fail("가리거나 삭제할 때는 사유를 적어 주세요(사장님 화면에 보여요).", 400);

  const now = new Date().toISOString();
  const patch = action === "keep"
    ? { report_status: "kept", hidden: false }
    : action === "hide" ? { report_status: "hidden", hidden: true } : { report_status: "deleted", hidden: true, deleted_at: now };
  const { data, error } = await db.from("lodging_reviews").update({ ...patch, report_decided_at: now, report_admin_note: note, updated_at: now })
    .eq("id", id).not("report_status", "is", null).select("id, guest_auth_user_id").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("신고된 후기를 찾을 수 없어요.", 404);
  if (body?.ban === true && action !== "keep") {
    const { error: banError } = await db.from("lodging_review_bans").upsert({ auth_user_id: data.guest_auth_user_id, reason: note, review_id: id }, { onConflict: "auth_user_id" });
    if (banError) return fail(`후기는 처리했지만 작성 제한을 걸지 못했어요: ${banError.message}`, 500);
  }
  return NextResponse.json({ ok: true });
}
