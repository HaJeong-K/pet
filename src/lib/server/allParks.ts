// src/lib/server/allParks.ts
//
// 전국 공원 목록(서버 전용, 30분 메모리 캐시). 공원 창구(/api/public-data/parks)와
// 구역별 장소 수 창구(/api/public-data/counts)가 함께 씁니다.
import { fetchAllRows } from "@/lib/supabasePaging";

let cachedRaw: any[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60_000; // 공원은 자주 안 바뀌므로 기존 parkPlaces.ts와 동일하게 30분

export async function getAllParks(): Promise<any[]> {
  if (cachedRaw && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRaw;
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
    cachedRaw = mapped;
    cachedAt = Date.now();
    return mapped;
  } catch {
    return [];
  }
}
