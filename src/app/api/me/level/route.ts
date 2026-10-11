import { NextRequest, NextResponse } from "next/server";
import { computeMemberLevel, recordVisit, userFromRequest } from "@/lib/server/memberLevelData";

export const runtime = "nodejs";

// GET /api/me/level  (Authorization: Bearer <로그인 토큰>)
//
// 내 레벨과 그 근거(점수 내역, 이번 달 방문 일수, 다음 단계까지 남은 것)를 돌려줍니다.
// 부를 때 오늘 방문도 함께 기록합니다. 레벨 표가 아직 없으면 { available: false }.
export async function GET(req: NextRequest) {
  const user = await userFromRequest(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    await recordVisit(user.id);
    const result = await computeMemberLevel(user.id);
    if (!result) return NextResponse.json({ available: false });
    return NextResponse.json({ available: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[/api/me/level]", e);
    return NextResponse.json({ error: "레벨을 불러오지 못했어요." }, { status: 500 });
  }
}
