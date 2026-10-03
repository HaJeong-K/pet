// src/lib/parkPlace.ts
//
// 공원(전국도시공원정보표준데이터, parks 테이블)을 장소 상세 페이지에서 다루기 위한 번호 규칙.
// 공원은 places 테이블에 없고 번호(1, 2, 3…)가 일반 장소와 겹치기 때문에, 상세 페이지·후기·찜·
// 방문 인증에서는 "공원 번호 + 90억"을 장소 번호로 씁니다(/place/9000000123).
//   · 직접 등록 장소: 10억 미만 / 공공데이터 장소: 10억 ~ 약 83억(publicDataAggregate.ts) / 공원: 90억 이상
// 이렇게 하면 후기(reviews.place_id)·찜(reactions)·방문 인증(place_checkins)을 표 변경 없이 그대로 씁니다.

export const PARK_ID_BASE = 9_000_000_000;

export function isParkPlaceId(id: string | number | null | undefined): boolean {
  const n = Number(id);
  return Number.isFinite(n) && n > PARK_ID_BASE;
}

/** 공원 번호(parks.id) → 장소 번호 */
export const parkPlaceId = (parkId: number | string): number => PARK_ID_BASE + Number(parkId);
/** 장소 번호 → 공원 번호(parks.id) */
export const parkIdOf = (placeId: number | string): number => Number(placeId) - PARK_ID_BASE;

type ParkLike = {
  id: number | string;
  name: string;
  address?: string | null;
  lat: string | number;
  lng: string | number;
  category?: string | null;
  area?: string | null;
  managementAgency?: string | null;
  management_agency?: string | null;
  phone?: string | null;
  facilityNote?: string | null;
  facility_note?: string | null;
};

/** 공원 → 장소 상세 페이지가 읽는 모양으로 변환 */
export function parkToPlace(park: ParkLike) {
  return {
    id: parkPlaceId(park.id),
    name: park.name,
    address: park.address || "",
    lat: park.lat,
    lng: park.lng,
    category: "공원",
    pet_zone: "terrace",
    image_url: "/images/default-place.png",
    phone: park.phone || null,
    is_park: true,
    source: "park",
    park_category: park.category || "공원",
    park_area: park.area || null,
    park_agency: park.managementAgency ?? park.management_agency ?? null,
    park_facility_note: park.facilityNote ?? park.facility_note ?? null,
  };
}
