import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabasePaging";
import { haversineKm } from "@/lib/geo";

export const runtime = "nodejs";

// parkPlaces.ts와 동일한 맥락(publicDataPlaces/nearby 라우트 상단 주석 참고) —
// 전국 19,000여 개 공원을 매번 클라이언트가 전량 받는 대신, 서버에서 반경
// 필터링까지 마친 결과만 내려줍니다. lat/lng 없이 호출하면 전국 데이터 폴백.

let cachedRaw: any[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60_000; // 공원은 자주 안 바뀌므로 기존 parkPlaces.ts와 동일하게 30분

async function getAllParks(): Promise<any[]> {
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // ⚠ /api/public-data/nearby와 동일한 버그 — searchParams.get()의 null을
  // Number()로 바로 바꾸면 0(=적도/그리니치 인근 좌표)이 되어버려 전국 폴백이
  // 아니라 "결과 0건"이 나왔습니다. 파라미터 존재 여부를 먼저 확인합니다.
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusKm = Number(searchParams.get("radiusKm")) || 40;

  const all = await getAllParks();

  if (latParam == null || lngParam == null) {
    return NextResponse.json(all);
  }

  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(all);
  }

  const nearby = all.filter((p) => {
    const pLat = parseFloat(p.lat);
    const pLng = parseFloat(p.lng);
    if (isNaN(pLat) || isNaN(pLng)) return false;
    return haversineKm(lat, lng, pLat, pLng) <= radiusKm;
  });

  return NextResponse.json(nearby);
}
