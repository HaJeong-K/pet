import { NextRequest, NextResponse } from "next/server";
import { ownerContext } from "@/lib/server/ownerStore";
import { uploadOwnerImage } from "@/lib/server/ownerImage";
import { createRateLimiter } from "@/lib/server/rateLimit";

// POST /api/owner/notices/image  (multipart: file)
// 공지 사진을 올리고 주소를 돌려줍니다. 받은 주소를 공지 저장(/api/owner/notices)에 함께 보냅니다.

export const runtime = "nodejs";
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!allow(ctx.userId)) return NextResponse.json({ error: "사진을 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const result = await uploadOwnerImage("notice-images", ctx.placeId, form?.get("file"));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
}
