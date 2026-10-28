import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";

// GET /api/place-owner?placeId= — 이 가게를 인증된 사장님이 직접 관리하는지(장소 상세의 "사장님 인증" 표시용)
//   managed:    사업자 인증을 마친 사장님 계정이 이 가게에 연결돼 있으면 true
//   verifiedAt: 사장님이 가게 정보를 마지막으로 확인·수정한 때(places.owner_verified_at, 없으면 null)
// 사장님이 누구인지는 내려주지 않습니다. 공공데이터 장소(10억 이상)는 사장님이 연결될 수 없어 항상 false.

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0 || placeId >= 1_000_000_000) return NextResponse.json({ managed: false, verifiedAt: null });
  const [owner, place] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }).eq("owner_status", "verified").eq("owner_place_id", placeId),
    db.from("places").select("owner_verified_at").eq("id", placeId).maybeSingle(),
  ]);
  const managed = !owner.error && (owner.count ?? 0) > 0;
  const verifiedAt = managed && !place.error ? ((place.data as { owner_verified_at?: string | null } | null)?.owner_verified_at ?? null) : null;
  return NextResponse.json({ managed, verifiedAt }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
