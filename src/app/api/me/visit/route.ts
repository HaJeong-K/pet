import { NextRequest, NextResponse } from "next/server";
import { computeMemberLevel, recordVisit, userFromRequest } from "@/lib/server/memberLevelData";

export const runtime = "nodejs";

// POST /api/me/visit  (Authorization: Bearer <로그인 토큰>)
//
// 로그인한 회원이 오늘 들어왔음을 기록합니다(하루에 한 번 — 브라우저가 하루에 한 번만 부릅니다).
// 이때 레벨도 함께 다시 계산해 저장합니다 — 닉네임 옆 배지가 월말 심사(방문 부족 시 한 단계 내려감)를 제때 반영하도록.
export async function POST(req: NextRequest) {
  const user = await userFromRequest(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    const recorded = await recordVisit(user.id);
    const result = recorded ? await computeMemberLevel(user.id) : null;
    return NextResponse.json({ ok: recorded, level: result?.progress.current.level ?? null });
  } catch (e) {
    console.error("[/api/me/visit]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
