import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { THUMB_BUCKET, thumbStorage } from "@/lib/server/shelterThumbs";
import { isShelterImageHost, SHELTER_IMAGE_WIDTHS } from "@/lib/shelterImage";

// GET /api/shelter-image?u=<공고 사진 주소>&w=480|960
// 유기동물 공고 사진을 정부 서버에서 받아 작은 WebP로 줄여 내려줍니다(src/lib/shelterImage.ts 설명 참고).
//  · 원본 수백 KB → 목록용 480px 약 20~40KB.
//  · 줄인 사진은 우리 저장소(비공개 버킷 shelter-thumbs)에 보관합니다 — 정부 서버는 사진 한 장에 3~20초가 걸리고
//    가끔 응답이 없어서, 한 번 받은 사진은 다시 정부 서버에 가지 않습니다(새로 배포해 CDN 보관분이 비워져도 유지).
//  · 그 위에 CDN이 30일 보관합니다(공고 사진은 주소가 바뀌지 않음).
//  · 오래된 보관분은 새벽 자동 작업이 지웁니다(src/lib/server/shelterThumbs.ts).
//  · 정부 동물보호 사이트(animal.go.kr) 주소만 받습니다. 아무 주소나 대신 받아 주면 악용될 수 있어서입니다.
//  · 정부 서버가 느리거나 실패하면 한 번 더 시도하고, 그래도 안 되면 실패로 답합니다(화면은 발자국 그림으로 대체).

export const runtime = "nodejs";
export const maxDuration = 40;

const FETCH_TIMEOUT_MS = 14_000;
/** 원본이 이보다 크면 받지 않습니다(메모리 보호). */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

async function fetchSource(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; gachigagae-image/1.0)", Accept: "image/*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const length = Number(res.headers.get("content-length") || 0);
      if (length > MAX_SOURCE_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_SOURCE_BYTES) return null;
      return buf;
    } catch {
      // 시간 초과·연결 실패 → 한 번 더
    }
  }
  return null;
}

const ok = (image: Buffer) =>
  new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      // 브라우저 하루, CDN 30일. 그 뒤에도 일단 보관본을 주면서 뒤에서 새로 받아 둡니다.
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
    },
  });

const fail = (status: number, message: string) =>
  // 실패는 짧게만 보관합니다(정부 서버가 잠깐 느렸던 것일 수 있어 곧 다시 시도되게).
  new NextResponse(message, { status, headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("u") || "";
  const width = Number(req.nextUrl.searchParams.get("w")) || 480;
  if (!isShelterImageHost(source)) return fail(400, "unsupported image host");
  if (!(SHELTER_IMAGE_WIDTHS as readonly number[]).includes(width)) return fail(400, "unsupported width");

  // 1) 이미 줄여 둔 사진이 있으면 그것을 줍니다.
  const key = `${createHash("sha1").update(source).digest("hex")}-${width}.webp`;
  const store = thumbStorage();
  const saved = await store.from(THUMB_BUCKET).download(key);
  if (!saved.error && saved.data) return ok(Buffer.from(await saved.data.arrayBuffer()));

  // 2) 없으면 정부 서버에서 받아 줄이고 보관합니다.
  const original = await fetchSource(source);
  if (!original) return fail(502, "image source unavailable");

  try {
    // rotate(): 사진에 기록된 방향 정보대로 바로 세웁니다(폰으로 찍은 사진이 누워 보이지 않게).
    const output = await sharp(original, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    // 보관 실패는 무시합니다(사진은 그대로 내려주고, 다음 요청 때 다시 시도).
    await store.createBucket(THUMB_BUCKET, { public: false }).catch(() => {});
    await store.from(THUMB_BUCKET).upload(key, output, { upsert: true, contentType: "image/webp" }).catch(() => {});
    return ok(output);
  } catch {
    return fail(502, "image could not be processed");
  }
}
