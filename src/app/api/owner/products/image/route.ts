import { NextRequest, NextResponse } from "next/server";
import { ownerContext } from "@/lib/server/ownerStore";
import { uploadOwnerImage } from "@/lib/server/ownerImage";
import { createRateLimiter } from "@/lib/server/rateLimit";

// POST /api/owner/products/image  (multipart: file)
// 상품 사진을 올리고 주소를 돌려줍니다. 받은 주소를 상품 저장(/api/owner/products)에 함께 보냅니다.

export const runtime = "nodejs";
// 한 사람이 10분에 40장까지(상품을 한꺼번에 올리는 경우를 생각해 넉넉히)
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 40 });

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!allow(ctx.userId)) return NextResponse.json({ error: "사진을 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const result = await uploadOwnerImage("product-images", ctx.placeId, form?.get("file"));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
}
