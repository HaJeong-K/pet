// src/lib/foodsafetyPlaces.ts
//
// 식품안전나라(식품의약품안전처) — 반려동물 동반출입 음식점
// 포털: foodsafetykorea.go.kr/portal/petKorea.do (또는 data.go.kr에서 "반려동물 동반출입 음식점" 검색)
//
// 이 데이터셋은 실시간 API가 아니라 엑셀(XLSX) 다운로드 형태이고, 원본에는 좌표가 없어
// scripts/import-foodsafety-places.mjs 로 카카오 로컬 API 지오코딩까지 거쳐 Supabase
// foodsafety_restaurants 테이블에 적재해두고 그 테이블을 읽는 구조입니다. 스크립트
// 사용법은 해당 파일 상단 주석을 참고하세요.
//
// 테이블이 아직 없거나 비어 있으면 아래 함수는 조용히 빈 배열을 반환해 지도 로딩에는
// 영향을 주지 않습니다.

import { supabase } from "@/lib/supabase";

export async function fetchFoodsafetyPlaces(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from("foodsafety_restaurants")
      .select("id, name, address, lat, lng, category, region, memo");

    if (error || !data) return [];

    return data
      .filter((row) => row.lat && row.lng) // 지오코딩 실패로 좌표 없는 행은 지도에 못 올리므로 제외
      .map((row) => ({
        source_id: `foodsafety-${row.id}`,
        name: row.name,
        address: row.address || "",
        lat: row.lat,
        lng: row.lng,
        category: row.category || "카페/식당",
        memo: row.memo || "식품안전나라 반려동물 동반출입 음식점 제공 정보",
      }));
  } catch (e) {
    // foodsafety_restaurants 테이블이 없는 초기 상태에서도 지도 로딩이 깨지지 않도록 방어
    return [];
  }
}
