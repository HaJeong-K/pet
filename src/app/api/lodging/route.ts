import { NextRequest, NextResponse } from "next/server";
import { getLodging } from "@/lib/server/lodgingStore";

// GET /api/lodging?placeId=  — 손님용 숙소 정보(동반 규정 + 판매 중인 객실). 로그인 없이 누구나.
// 숙소 사장님이 "숙소·객실" 메뉴에서 올린 내용입니다. 아직 올린 게 없으면 profile: null, rooms: [].

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0) return NextResponse.json({ error: "숙소를 찾을 수 없어요." }, { status: 400 });
  try {
    const data = await getLodging(placeId, true);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "불러오지 못했어요." }, { status: 500 });
  }
}
