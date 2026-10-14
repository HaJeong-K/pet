import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, ownerContext } from "@/lib/server/ownerStore";
import { BANNER_IMAGE_MAX_BYTES, BANNER_IMAGE_TYPES } from "@/lib/bannerCreative";
import { createRateLimiter } from "@/lib/server/rateLimit";

// POST /api/owner/banner/image  (multipart: file)
// 배너에 쓸 사진을 올리고 주소를 돌려줍니다(미리보기에 바로 씀). 사진을 올리는 것만으로는 배너가 바뀌지 않고,
// "배너 저장"을 눌러야 실제 광고에 반영됩니다 — 그래서 올리기는 2주 한도와 상관없이 할 수 있습니다.
// 파일 종류는 이름이 아니라 파일 앞머리(실제 내용)로 확인합니다.

export const runtime = "nodejs";
const BUCKET = "banner-images";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
// 한 사람이 10분에 20장까지
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", ext: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { type: "image/webp", ext: "webp" };
  return null;
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (!allow(ctx.userId)) return fail("사진을 너무 자주 올렸어요. 잠시 후 다시 시도해 주세요.", 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("사진 파일을 골라 주세요.", 400);
  if (file.size > BANNER_IMAGE_MAX_BYTES) return fail("사진은 5MB까지 올릴 수 있어요.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind || !BANNER_IMAGE_TYPES.includes(kind.type)) return fail("JPG·PNG·WEBP 사진만 올릴 수 있어요.", 400);

  // 보관함이 없으면 만듭니다(누구나 볼 수 있는 공개 보관함 — 광고 사진이라 공개가 맞습니다). 이미 있으면 그대로 둡니다.
  await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: BANNER_IMAGE_MAX_BYTES, allowedMimeTypes: BANNER_IMAGE_TYPES }).catch(() => {});
  const path = `${ctx.placeId}/${randomUUID()}.${kind.ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000" });
  if (error) return fail(`사진을 올리지 못했어요: ${error.message}`, 500);
  return NextResponse.json({ url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}
