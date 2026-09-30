// src/lib/placeCache.ts
//
// 지도(KakaoMap)가 이미 들고 있는 장소 데이터를 장소 상세 팝업과 나눠 쓰는 메모리 저장소.
// 지도에서 장소를 누르면 상세 팝업은 서버 응답을 기다리지 않고 이 데이터로 바로 그리고,
// 최신 정보는 뒤에서 받아와 바꿔 끼웁니다(체감상 즉시 열림). 새로고침하면 비워집니다.

const places = new Map<string, any>();

/** 공공데이터 출처 장소의 합성 id는 10억 이상입니다(publicDataAggregate.ts의 SOURCE_ID_BASE). */
export const PUBLIC_DATA_ID_MIN = 1_000_000_000;

export function isPublicDataPlaceId(id: string | number): boolean {
  return Number(id) >= PUBLIC_DATA_ID_MIN;
}

export function rememberPlaces(list: any[]): void {
  for (const p of list) {
    if (p && p.id != null) places.set(String(p.id), p);
  }
}

export function getRememberedPlace(id: string | number | undefined | null): any | null {
  if (id == null) return null;
  return places.get(String(id)) ?? null;
}
