import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { sortNotices, type PlaceNotice } from "@/lib/placeNotices";

// GET /api/place-notices?placeId= — 가게 공지(손님용). 대표 공지 먼저, 그다음 최신순. 지운 공지는 빼고.
// 표가 아직 없으면(scripts/sql/place-notices.sql 실행 전) 빈 목록.

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0) return NextResponse.json({ error: "가게를 찾을 수 없어요." }, { status: 400 });
  const { data, error } = await db.from("place_notices").select("id, title, content, pinned, created_at, updated_at")
    .eq("place_id", placeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (error && !isMissingSchema(error)) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notices: sortNotices((data ?? []) as PlaceNotice[]) }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
