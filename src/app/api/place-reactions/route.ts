import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";

// /api/place-reactions — 장소 좋아요·싫어요(비회원 포함) 누르기/취소(2026-11-08)
//   화면이 reactions 표에서 직접 지우면 남의 반응까지 한 번에 지울 수 있어서,
//   좋아요·싫어요는 여기서 "이 장소 + 이 기기 키" 한 건만 바꿉니다.
//   찜(bookmark)은 로그인 회원 본인 것만 화면에서 직접(DB 규칙: scripts/sql/lock-open-tables.sql).
//   POST { placeId, userKey, type: "like" | "dislike" | null }  — null이면 취소
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const KEY = /^[A-Za-z0-9_-]{8,64}$/; // 기기 키(보통 UUID)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const placeId = Number(body?.placeId);
  const userKey = typeof body?.userKey === "string" ? body.userKey : "";
  const type = body?.type === "like" || body?.type === "dislike" ? body.type : null;
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("장소를 찾을 수 없어요.", 400);
  if (!KEY.test(userKey)) return fail("잘못된 요청이에요.", 400);

  const { error: delError } = await db.from("reactions").delete()
    .eq("place_id", placeId).eq("user_key", userKey).in("type", ["like", "dislike"]);
  if (delError) return fail("잠시 후 다시 시도해 주세요.", 500);
  if (type) {
    const { error } = await db.from("reactions").insert([{ place_id: placeId, user_key: userKey, type }]);
    if (error) return fail("잠시 후 다시 시도해 주세요.", 500);
  }
  return NextResponse.json({ ok: true, type });
}
