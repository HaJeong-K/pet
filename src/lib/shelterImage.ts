// src/lib/shelterImage.ts
//
// 유기동물 공고 사진 주소 → 우리 서버가 줄여서 내려주는 주소(브라우저·서버 공용 규칙).
//
// 공고 사진은 정부 서버(animal.go.kr)의 원본이라 한 장이 수백 KB(큰 것은 700KB 이상)이고 응답도 느려서,
// 목록에서 사진이 한참 뒤에 뜨거나 끝내 안 뜨는 일이 있었습니다. /api/shelter-image가 원본을 한 번 받아
// 작은 크기(WebP)로 줄여 내려주고, 그 결과를 CDN이 오래 보관합니다 — 같은 사진은 두 번째부터 서버를 거치지 않습니다.

/** 줄여서 내려줄 수 있는 가로 크기(px) — 목록 카드용 / 상세 화면용 */
export const SHELTER_IMAGE_WIDTHS = [480, 960] as const;
export type ShelterImageWidth = (typeof SHELTER_IMAGE_WIDTHS)[number];

/** 사진을 받아 올 수 있는 곳 — 정부 동물보호 사이트만(다른 주소를 대신 받아 주는 통로로 쓰이지 않게). */
export function isShelterImageHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "animal.go.kr" || u.hostname.endsWith(".animal.go.kr"));
  } catch {
    return false;
  }
}

/** 화면에 넣을 사진 주소. 정부 사이트 사진이 아니면(없거나 다른 주소) 원래 주소를 그대로 돌려줍니다. */
export function shelterImageSrc(url: string | null | undefined, width: ShelterImageWidth = 480): string {
  if (!url) return "";
  return isShelterImageHost(url) ? `/api/shelter-image?w=${width}&u=${encodeURIComponent(url)}` : url;
}
