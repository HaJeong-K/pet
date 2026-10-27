// src/lib/server/ownerImage.ts
//
// 사장님이 올리는 사진(배너 사진·상품 사진·객실 사진)을 저장소에 넣는 공통 코드(서버 전용).
//   · 파일 종류는 이름이 아니라 파일 앞머리(실제 내용)로 확인합니다 — JPG·PNG·WEBP만.
//   · 보관함은 공개(누구나 볼 수 있는 광고·상품 사진)이고, 없으면 만듭니다.
//   · 경로는 "가게 번호/무작위 이름" — 저장할 때 "이 가게가 올린 사진인지"를 주소 앞부분으로 확인합니다(ownImageUrl).

import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/ownerStore";

export const OWNER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const OWNER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export type OwnerImageBucket = "banner-images" | "product-images" | "lodging-images";

function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", ext: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { type: "image/webp", ext: "webp" };
  return null;
}

/** 사진을 올리고 주소를 돌려줍니다. 문제가 있으면 이유를 돌려줍니다. */
export async function uploadOwnerImage(bucket: OwnerImageBucket, placeId: number, file: unknown): Promise<{ url: string } | { error: string; status: number }> {
  if (!(file instanceof File)) return { error: "사진 파일을 골라 주세요.", status: 400 };
  if (file.size > OWNER_IMAGE_MAX_BYTES) return { error: "사진은 5MB까지 올릴 수 있어요.", status: 400 };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return { error: "JPG·PNG·WEBP 사진만 올릴 수 있어요.", status: 400 };

  await db.storage.createBucket(bucket, { public: true, fileSizeLimit: OWNER_IMAGE_MAX_BYTES, allowedMimeTypes: OWNER_IMAGE_TYPES }).catch(() => {});
  const path = `${placeId}/${randomUUID()}.${kind.ext}`;
  const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000" });
  if (error) return { error: `사진을 올리지 못했어요: ${error.message}`, status: 500 };
  return { url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** 그 주소가 이 가게가 우리 보관함에 올린 사진인지(바깥 주소를 그대로 싣지 않게) */
export function ownImageUrl(bucket: OwnerImageBucket, placeId: number, url: string | null | undefined): boolean {
  return !url || url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${placeId}/`);
}
