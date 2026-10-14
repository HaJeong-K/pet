import { NextRequest, NextResponse } from "next/server";
import { ownerContext } from "@/lib/server/ownerStore";
import { uploadOwnerImage } from "@/lib/server/ownerImage";
import { createRateLimiter } from "@/lib/server/rateLimit";

// POST /api/owner/banner/image  (multipart: file)
// 배너에 쓸 사진을 올리고 주소를 돌려줍니다(미리보기에 바로 씀). 사진을 올리는 것만으로는 배너가 바뀌지 않고,
// "배너 저장"을 눌러야 실제 광고에 반영됩니다 — 그래서 올리기는 2주 한도와 상관없이 할 수 있습니다.
// 파일 확인과 저장은 상품 사진과 같은 코드를 씁니다(src/lib/server/ownerImage.ts).

export const runtime = "nodejs";
// 한 사람이 10분에 20장까지
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!allow(ctx.userId)) return NextResponse.json({ error: "사진을 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const result = await uploadOwnerImage("banner-images", ctx.placeId, form?.get("file"));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
}
