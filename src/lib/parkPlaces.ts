// src/lib/parkPlaces.ts
//
// 행정안전부 — 전국도시공원정보표준데이터 (data.go.kr/data/15012890/standard.do)
//
// 실시간 API가 아니라 CSV 파일 다운로드 형태로 제공되고, 원본에 위도/경도가 이미
// 포함돼 있어 별도 지오코딩 없이 scripts/import-parks.mjs로 한 번 가공해서 Supabase
// parks 테이블에 적재해두고 그 테이블을 읽는 구조입니다(culturePlaces.ts와 동일 패턴).
//
// recommend.ts의 "가장 가까운 공원까지의 거리" 가점에 쓰이고, KakaoMap.tsx에서
// 지도 위 공원 마커로도 표시됩니다. 테이블이 아직 없거나 비어 있으면(마이그레이션/
// 데이터 임포트 전) 조용히 빈 배열을 반환해서 나머지 지도 기능에 영향을 주지 않습니다.

import { fetchAllRows } from "@/lib/supabasePaging";

export interface ParkPlace {
  id: number;
  name: string;
  address: string;
  lat: string;
  lng: string;
  category: string;
  area: string | null;
  managementAgency: string | null;
  phone: string | null;
  /** 운동/유희/편익/교양/기타시설 중 값이 있는 것만 "라벨: 값" 형태로 이어붙인 메모.
   *  화장실·개수대 여부 같은 정형 데이터는 원본에 없어서, 구조화된 필드인 척하지 않고
   *  원문 그대로 보여주는 자유 텍스트로만 취급합니다. */
  facilityNote: string | null;
}

let cachedParks: ParkPlace[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60_000; // 공원 목록은 자주 안 바뀌므로 30분 캐시(다른 공공데이터보다 김)

export async function fetchParks(): Promise<ParkPlace[]> {
  if (cachedParks && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedParks;
  }
  try {
    const rows = await fetchAllRows(
      "parks",
      "id, name, address, lat, lng, category, area, management_agency, phone, facility_note"
    );
    const mapped = rows
      .filter((row: any) => row.lat && row.lng)
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        address: row.address || "",
        lat: row.lat,
        lng: row.lng,
        category: row.category || "공원",
        area: row.area || null,
        managementAgency: row.management_agency || null,
        phone: row.phone || null,
        facilityNote: row.facility_note || null,
      }));
    cachedParks = mapped;
    cachedAt = Date.now();
    return mapped;
  } catch {
    // parks 테이블이 아직 없는 초기 상태에서도 지도 로딩이 깨지지 않도록 방어
    return [];
  }
}
