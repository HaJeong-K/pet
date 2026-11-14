import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { isParkPlaceId } from "@/lib/parkPlace";
import { getParkAsPlace } from "@/lib/server/parkAsPlace";
import { createClient } from "@supabase/supabase-js";
import { loadPermitExtras } from "@/lib/server/permitExtras";

/**
 * 행정안전부 인허가 정보(영업 상태·확인한 날·업태·객실 수·영업 시작일) — 맞춰 둔 장소만.
 * 목록 전체에 싣지 않고 장소 하나를 열 때만 붙입니다(지도 목록이 무거워지지 않게).
 */
async function permitInfoOf(placeId: number): Promise<Record<string, unknown> | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const [{ data: row }, extras] = await Promise.all([
      db.from("public_place_permits").select("matched, status, checked_at").eq("place_id", placeId).maybeSingle(),
      loadPermitExtras(),
    ]);
    if (!row?.matched) return null;
    const extra = extras[String(placeId)] ?? {};
    return { status: row.status, checkedAt: row.checked_at, bizType: extra.t ?? null, rooms: extra.r ?? null, since: extra.o ?? null, homepage: extra.h ?? null };
  } catch {
    return null;
  }
}

export const runtime = "nodejs";

// ⚠ 장소 상세페이지 로딩 지연 수정: 예전엔 `places` 테이블에 없는(공공데이터 출처)
// 장소를 열 때마다 클라이언트가 fetchPublicDataPlaces()로 "전국 데이터 전체"를
// 받아서 거기서 .find()로 딱 하나만 찾아 썼습니다. 화면엔 "로딩중..."만 뜬 채
// 그 전국 데이터가 도착할 때까지(캐시 없을 때 10초 이상) 기다려야 했던 게 바로
// 이 패턴이었습니다. 이 라우트는 서버가 이미 들고 있는 병합 캐시(getMergedPublicDataPlaces,
// /api/public-data/nearby와 공유)에서 id 하나만 찾아 그 장소 하나만 내려주므로,
// 클라이언트는 필요한 만큼만(장소 하나 분량의 JSON) 받습니다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const placeId = Number(id);
  if (!Number.isFinite(placeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // 공원(장소 번호 90억 이상)은 parks 표에서 찾습니다.
  if (isParkPlaceId(placeId)) {
    const park = await getParkAsPlace(placeId);
    return park ? NextResponse.json(park) : NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const merged = await getMergedPublicDataPlaces();
  const found = merged.find((p) => p.id === placeId);

  if (!found) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const permit = await permitInfoOf(placeId);
  // 홈페이지 칸이 비어 있으면 인허가 기록의 홈페이지로 채웁니다(원래 값은 바꾸지 않음)
  return NextResponse.json({ ...found, website: found.website || permit?.homepage || null, permit });
}
