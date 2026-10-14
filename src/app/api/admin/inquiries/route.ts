import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { INQUIRY_NOTE_MAX, isClosedInquiry, isInquiryStatus } from "@/lib/partnerInquiry";

// 관리자 전용: 광고·제휴 문의함
//   GET                        → 들어온 문의 목록(최근 것 먼저). ?count=1 이면 새 문의 수와 배너 한도 변경 요청 수만(관리자 탭의 숫자용)
//   POST { id, status, note }  → 처리 상태 바꾸기(접수·협의 필요·진행 중·완료·반려) 그리고/또는 관리자 메모 저장
//                                 status와 note는 보낸 것만 바꿉니다(메모만 저장해도 상태는 그대로).

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
  // 완료·반려로 끝낸 지 1년이 지난 문의는 지웁니다(문의 양식에서 안내한 보관 기간).
  await db.from("partner_inquiries").delete().in("status", ["done", "rejected"]).lt("processed_at", new Date(Date.now() - 365 * 86_400_000).toISOString());
  const { data, error } = await db.from("partner_inquiries").select("id, kind, name, company, contact, message, status, admin_note, created_at, processed_at").order("created_at", { ascending: false }).limit(500);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, inquiries: [] }) : fail(error.message, 500);
  return NextResponse.json({ ready: true, inquiries: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => ({}))) as { id?: number; status?: string; note?: string };
  const id = Number(body.id);
  const hasStatus = body.status !== undefined, hasNote = typeof body.note === "string";
  if (!Number.isInteger(id) || id <= 0 || (!hasStatus && !hasNote) || (hasStatus && !isInquiryStatus(body.status))) return fail("요청이 올바르지 않아요.", 400);

  const patch: Record<string, unknown> = {};
  if (hasStatus) {
    patch.status = body.status;
    // 완료·반려로 끝낸 때를 적어 둡니다(1년 보관의 기준). 다시 열면 지웁니다.
    patch.processed_at = isClosedInquiry(body.status!) ? new Date().toISOString() : null;
  }
  if (hasNote) patch.admin_note = body.note!.trim().slice(0, INQUIRY_NOTE_MAX) || null;

  const { error } = await db.from("partner_inquiries").update(patch).eq("id", id);
  if (error) {
    // 예전 표는 접수·완료 두 가지만 저장할 수 있게 막혀 있습니다.
    if (/partner_inquiries_status_check|check constraint/i.test(error.message)) return fail("이 상태를 저장하려면 Supabase SQL 편집기에서 scripts/sql/partner-inquiries-status.sql을 실행해 주세요.", 503);
    return fail(error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
