// src/lib/culturePlaces.ts
//
// 한국문화정보원 — 전국 반려동물 동반 가능 문화시설 위치 데이터
// data.go.kr/data/15111389/fileData.do
//
// 이 데이터셋은 실시간 OpenAPI가 아니라 CSV 파일 다운로드 형태로 제공됩니다. 원본 CSV에는
// 위도/경도가 이미 포함돼 있어 별도 지오코딩 없이, scripts/import-culture-places.mjs 로
// 한 번 가공(반려동물 동반 가능 = Y 인 행만 필터링 + 중복 제거)해서 Supabase
// culture_facilities 테이블에 적재해두고 그 테이블을 읽는 구조입니다. 스크립트 사용법은
// 해당 파일 상단 주석을 참고하세요.
//
// 테이블이 아직 없거나 비어 있으면 아래 함수는 조용히 빈 배열을 반환합니다.

import { fetchAllRows } from "@/lib/supabasePaging";

export async function fetchCulturePlaces(): Promise<any[]> {
  try {
    const data = await fetchAllRows(
      "culture_facilities",
      "id, name, address, lat, lng, category, phone, website, hours, closed_days, parking, entry_fee, pet_zone, large_dog, memo"
    );

    return data.map((row) => ({
      source_id: `culture-${row.id}`,
      name: row.name,
      address: row.address || "",
      lat: row.lat,
      lng: row.lng,
      category: row.category || "문화시설",
      phone: row.phone || null,
      website: row.website || null,
      hours: row.hours || null,
      closed_days: row.closed_days || null,
      parking: row.parking || null,
      entry_fee: row.entry_fee || null,
      pet_zone: row.pet_zone || "both",
      large_dog: row.large_dog ?? null,
      memo: row.memo || "한국문화정보원 반려동물 동반 가능 문화시설 제공 정보",
    }));
  } catch (e) {
    // culture_facilities 테이블이 없는 초기 상태에서도 지도 로딩이 깨지지 않도록 방어
    return [];
  }
}
