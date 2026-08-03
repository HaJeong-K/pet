// src/lib/openPlace.ts
//
// 장소 상세로 이동하는 공통 헬퍼. 동물병원·동물약국은 지도 화면과 분리된
// 별도의 새 창(팝업)으로 열고, 그 외 카테고리는 기존처럼 인앱 모달/페이지로 이동합니다.
// KakaoMap, 마이페이지 등 장소 상세로 이동하는 모든 곳에서 공유합니다.

export const SEPARATE_WINDOW_CATEGORIES = ["동물병원", "동물약국"];

export interface MinimalRouter {
  push: (href: string) => void;
}

export interface MinimalPlace {
  id: number | string;
  category?: string | null;
}

export function openPlaceDetail(router: MinimalRouter, place: MinimalPlace | null | undefined) {
  if (!place) return;
  if (place.category && SEPARATE_WINDOW_CATEGORIES.includes(place.category)) {
    if (typeof window !== "undefined") {
      window.open(
        `/place/${place.id}`,
        `place_${place.id}`,
        "width=480,height=860,noopener,noreferrer,scrollbars=yes,resizable=yes"
      );
    }
    return;
  }
  router.push(`/place/${place.id}`);
}
