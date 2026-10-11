import { NextRequest, NextResponse } from "next/server";
import { getMemberLevels } from "@/lib/server/memberLevelData";

export const runtime = "nodejs";

// GET /api/member-levels?ids=<회원 번호>,<회원 번호>…
//
// 닉네임 옆 레벨 배지용: 회원들의 지금 레벨 번호만 돌려줍니다(점수 등 다른 정보는 주지 않습니다).
// 기록이 없는 회원은 결과에 없습니다(화면에서는 배지를 붙이지 않습니다).
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const levels = await getMemberLevels(ids);
  return NextResponse.json({ levels }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
