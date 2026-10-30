import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";

export const runtime = "nodejs";

// GET /api/owner-badges?ids=<회원 번호>,<회원 번호>…
//
// 닉네임 옆 "가게명 사장님" 배지용: 인증된 사장님만 가게 이름과 가게 번호를 돌려줍니다(연락처 등 다른 정보는 주지 않음).
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ owners: {} });
  const { data, error } = await db.from("users").select("auth_user_id, owner_business_name, owner_place_id").in("auth_user_id", ids).eq("owner_status", "verified");
  if (error) return NextResponse.json({ owners: {} });
  const owners = Object.fromEntries((data ?? []).filter((u) => u.owner_business_name).map((u) => [u.auth_user_id, { name: u.owner_business_name, placeId: u.owner_place_id }]));
  return NextResponse.json({ owners }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
