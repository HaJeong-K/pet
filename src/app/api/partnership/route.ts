import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { cleanInquiry, inquiryKindLabel } from "@/lib/partnerInquiry";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { notifyAdmin } from "@/lib/server/notify";

// POST /api/partnership  { kind, name, company, contact, message, website }
// 사이트 아래 "광고·제휴 문의"로 들어온 글을 저장하고 관리자에게 바로 알립니다(카카오톡·앱 알림).
// 로그인하지 않아도 보낼 수 있어서, 한 사람이 1시간에 3건까지로 막고 자동 입력(봇)을 걸러 냅니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const allow = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return fail("문의를 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => null);
  // 사람에게는 보이지 않는 칸 — 채워져 있으면 자동 입력으로 보고 받은 척만 합니다.
  if (typeof body?.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });
  const cleaned = cleanInquiry(body);
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { inquiry } = cleaned;
  const user = await userOf(req);

  const { error } = await db.from("partner_inquiries").insert([{ ...inquiry, auth_user_id: user?.id ?? null }]);
  if (error) {
    console.error("[/api/partnership] 저장 실패:", error.message);
    return fail(isMissingSchema(error) ? "문의 접수를 준비하고 있어요. 아래 이메일로 보내 주세요." : "문의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", isMissingSchema(error) ? 503 : 500);
  }
  await notifyAdmin({
    title: `📮 ${inquiryKindLabel(inquiry.kind)}가 들어왔어요`,
    lines: [`${inquiry.company ? `${inquiry.company} · ` : ""}${inquiry.name}`, inquiry.message.slice(0, 80)],
    path: "/admin/inquiries",
  });
  return NextResponse.json({ ok: true });
}
