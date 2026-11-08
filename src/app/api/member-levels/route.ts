import { NextRequest, NextResponse } from "next/server";
import { getMemberLevels } from "@/lib/server/memberLevelData";
import { db } from "@/lib/server/ownerStore";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";

// GET /api/member-levels?ids=<회원 번호>,<회원 번호>…
//
// 닉네임 옆 레벨 배지용: 회원들의 지금 레벨 번호만 돌려줍니다(점수 등 다른 정보는 주지 않습니다).
// 기록이 없는 회원은 결과에 없습니다(화면에서는 배지를 붙이지 않습니다).
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  // 관리자 계정이 쓴 글·댓글에는 레벨 대신 "운영진" 표시(2026-11-08)
  const uuids = ids.filter((id) => UUID.test(id)).slice(0, 200);
  const [levels, adminRows] = await Promise.all([
    getMemberLevels(ids),
    uuids.length ? db.from("users").select("auth_user_id").in("auth_user_id", uuids).eq("is_admin", true).then((r) => r.data ?? []) : Promise.resolve([] as { auth_user_id: string }[]),
  ]);
  const admins = adminRows.map((r) => String(r.auth_user_id));
  return NextResponse.json({ levels, admins }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
