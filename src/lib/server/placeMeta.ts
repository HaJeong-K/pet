// src/lib/server/placeMeta.ts
//
// 공유 미리보기(카카오톡·메신저 카드)와 검색 노출에 쓰는 장소 요약 정보(서버 전용).
// 직접 등록·제보된 장소는 DB에서, 공공데이터 장소(id 10억 이상)는 메모리에 올려 둔 병합 목록에서 찾습니다.
// ⚠ 예전엔 공공데이터 장소는 전국 데이터를 매번 다시 받아야 해서 미리보기를 포기했는데, 이제 스냅샷
//    캐시(src/lib/publicDataAggregate.ts) 덕분에 메모리에서 바로 찾을 수 있습니다.

import { supabase } from "@/lib/supabase";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { siteUrl } from "@/lib/siteUrl";
import { isParkPlaceId } from "@/lib/parkPlace";
import { getParkAsPlace } from "@/lib/server/parkAsPlace";

export type PlaceMeta = {
  id: number;
  name: string;
  address: string;
  category: string | null;
  petZone: string | null;
  /** 실제 장소 사진(기본 이미지는 제외) — 없으면 null */
  photo: string | null;
};

const PUBLIC_DATA_ID_MIN = 1_000_000_000;
const DEFAULT_IMAGES = new Set(["/images/default-place.png", "/icons/header_logo_final.png"]);

export const PET_ZONE_TEXT: Record<string, string> = {
  indoor: "실내 동반 가능",
  terrace: "야외 동반 가능",
  both: "실내외 모두 가능",
};

function realPhoto(url: unknown): string | null {
  if (typeof url !== "string" || !url || DEFAULT_IMAGES.has(url)) return null;
  if (url.startsWith("http://")) return "https://" + url.slice("http://".length);
  return url.startsWith("https://") ? url : null;
}

export async function getPlaceMeta(rawId: string | number): Promise<PlaceMeta | null> {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (isParkPlaceId(id)) {
    const park = await getParkAsPlace(id);
    return park ? { id, name: park.name, address: park.address, category: "공원", petZone: null, photo: null } : null;
  }

  if (id >= PUBLIC_DATA_ID_MIN) {
    const place = (await getMergedPublicDataPlaces().catch(() => [])).find((p) => p.id === id);
    if (!place) return null;
    return { id, name: place.name, address: place.address || "", category: place.category ?? null, petZone: place.pet_zone ?? null, photo: realPhoto(place.image_url) };
  }

  const { data: place } = await supabase
    .from("places")
    .select("name, address, category, pet_zone, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!place) return null;
  return { id, name: place.name, address: place.address || "", category: place.category ?? null, petZone: place.pet_zone ?? null, photo: realPhoto(place.image_url) };
}

/** 공유 카드에 쓸 이미지 주소: 실제 사진이 있으면 그 사진, 없으면 서버가 그려 주는 카드 */
export function placeShareImage(meta: PlaceMeta): string {
  return meta.photo ?? `${siteUrl}/api/og/place/${meta.id}`;
}

export function placeShareDescription(meta: PlaceMeta): string {
  const parts = [meta.address, meta.category, meta.petZone ? PET_ZONE_TEXT[meta.petZone] : null].filter(Boolean);
  return parts.length > 0
    ? `${parts.join(" · ")} — 반려동물과 함께 갈 수 있는 곳`
    : "반려동물과 함께 갈 수 있는 곳 — 같이가개에서 상세정보를 확인하세요.";
}
