import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { getAllParks } from "@/lib/server/allParks";
import { blockKey, buildCountBlocks, parseCountParams, type CountRow } from "@/lib/tileCounts";

export const runtime = "nodejs";

// GET /api/public-data/counts?level=8&bx=317&by=93
//
// 그 확대 단계의 "구역별 장소 수"를 묶음 하나만큼 돌려줍니다 — 지도를 넓게 볼 때 장소를 하나하나 받는 대신
// 이 숫자만 받아 동그라미로 보여 줍니다(규칙은 src/lib/tileCounts.ts).
// 주소가 묶음마다 고정이라 CDN이 같은 지역을 보는 모든 방문자에게 같은 응답을 돌려줍니다.
// 관리자가 장소를 숨기거나 새 장소가 생겨도 약 5분 뒤 반영됩니다(장소 목록과 같은 주기).

// 전체 목록이 새로 만들어졌을 때만(배열이 바뀌었을 때만) 다시 셉니다. 확대 단계별로 처음 요청될 때 한 번 셉니다.
let cached: { places: unknown[]; parks: unknown[]; byLevel: Map<number, Map<string, CountRow[]>> } | null = null;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params = parseCountParams(sp.get("level"), sp.get("bx"), sp.get("by"));
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" };
  if (!params) return NextResponse.json([], { headers });

  const [places, parks] = await Promise.all([getMergedPublicDataPlaces(), getAllParks()]);
  if (!cached || cached.places !== places || cached.parks !== parks) cached = { places, parks, byLevel: new Map() };
  let blocks = cached.byLevel.get(params.level);
  if (!blocks) {
    blocks = buildCountBlocks(places, parks, params.level);
    cached.byLevel.set(params.level, blocks);
  }
  return NextResponse.json(blocks.get(blockKey(params.bx, params.by)) ?? [], { headers });
}
