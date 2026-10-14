import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";

// 관리자 전용: 광고·제휴 문의함
//   GET                        → 들어온 문의 목록(새 문의 먼저). ?count=1 이면 새 문의 수와 배너 한도 변경 요청 수만(관리자 탭의 숫자용)
//   POST { id, status, note }  → 처리 상태 바꾸기(new ↔ done)와 메모

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  if (req.nextUrl.searchParams.get("count")) {
    const [inquiries, bannerRequests] = await Promise.all([
      db.from("partner_inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
      db.from("banner_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    return NextResponse.json({ fresh: inquiries.error ? 0 : inquiries.count ?? 0, bannerRequests: bannerRequests.error ? 0 : bannerRequests.count ?? 0 });
  }
  // 답을 드린 지 1년이 지난 문의는 지웁니다(문의 양식에서 안내한 보관 기간).
  await db.from("partner_inquiries").delete().eq("status", "done").lt("processed_at", new Date(Date.now() - 365 * 86_400_000).toISOString());
  const { data, error } = await db.from("partner_inquiries").select("id, kind, name, company, contact, message, status, admin_note, created_at, processed_at").order("created_at", { ascending: false }).limit(500);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, inquiries: [] }) : fail(error.message, 500);
  return NextResponse.json({ ready: true, inquiries: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => ({}))) as { id?: number; status?: string; note?: string };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0 || (body.status !== "new" && body.status !== "done")) return fail("요청이 올바르지 않아요.", 400);
  const { error } = await db.from("partner_inquiries").update({
    status: body.status,
    processed_at: body.status === "done" ? new Date().toISOString() : null,
    ...(typeof body.note === "string" ? { admin_note: body.note.trim().slice(0, 500) || null } : {}),
  }).eq("id", id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
