import { NextRequest, NextResponse } from "next/server";
import { db, userOf } from "@/lib/server/ownerStore";

// POST /api/me/nickname-sync — 닉네임을 바꾸면 내가 쓴 글·댓글·후기·답글의 닉네임도 같이 바꿉니다(2026-11-07)
//   글마다 닉네임이 따로 저장돼 있어 예전 글에 옛 닉네임이 남던 문제. 바꿀 이름은 요청 값이 아니라
//   회원 정보(users.nickname)에 저장된 값을 씁니다(마이페이지가 먼저 저장한 뒤 이걸 부름).
//   대상: 커뮤니티 글·댓글(author_auth_key), 장소 후기·답글(auth_user_id) — 로그인 회원으로 쓴 것만(비회원 글은 대상 아님).

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: me } = await db.from("users").select("nickname").eq("auth_user_id", user.id).maybeSingle();
  const nickname = me?.nickname?.trim();
  if (!nickname) return NextResponse.json({ error: "닉네임을 찾을 수 없어요." }, { status: 400 });

  const results = await Promise.all([
    db.from("community_posts").update({ nickname }).eq("author_auth_key", user.id).neq("nickname", nickname),
    db.from("community_comments").update({ nickname }).eq("author_auth_key", user.id).neq("nickname", nickname),
    db.from("reviews").update({ nickname }).eq("auth_user_id", user.id).neq("nickname", nickname),
    db.from("review_replies").update({ nickname }).eq("auth_user_id", user.id).neq("nickname", nickname),
  ]);
  const failed = results.filter((r) => r.error).length;
  if (failed) return NextResponse.json({ error: "일부 글의 닉네임을 바꾸지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
