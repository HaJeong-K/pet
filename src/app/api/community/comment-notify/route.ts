import { NextRequest, NextResponse, after } from "next/server";
import { db, userOf } from "@/lib/server/ownerStore";
import { notifyGuest } from "@/lib/server/guestNotify";
import { createRateLimiter } from "@/lib/server/rateLimit";

// 내 글·내 댓글에 새 댓글이 달렸을 때 알림 — POST { commentId }
// 댓글 작성자 본인만 부를 수 있습니다. 본인에게는 보내지 않고, 나를 차단한 사람에게도 보내지 않습니다.

const allow = createRateLimiter({ windowMs: 60_000, max: 20 });

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!allow(user.id)) return NextResponse.json({ ok: true });
  const body = await req.json().catch(() => null);
  const commentId = body?.commentId;
  if (commentId == null) return NextResponse.json({ error: "댓글을 찾을 수 없어요." }, { status: 400 });

  const { data: comment } = await db.from("community_comments").select("id, post_id, parent_id, author_auth_key, content, nickname").eq("id", commentId).maybeSingle();
  if (!comment || comment.author_auth_key !== user.id) return NextResponse.json({ error: "댓글을 찾을 수 없어요." }, { status: 404 });

  const { data: post } = await db.from("community_posts").select("id, title, author_auth_key").eq("id", comment.post_id).maybeSingle();
  const { data: parent } = comment.parent_id ? await db.from("community_comments").select("author_auth_key").eq("id", comment.parent_id).maybeSingle() : { data: null };

  const targets = new Map<string, string>();
  if (parent?.author_auth_key) targets.set(parent.author_auth_key, "내 댓글에 답글이 달렸어요");
  if (post?.author_auth_key && !targets.has(post.author_auth_key)) targets.set(post.author_auth_key, "내 글에 댓글이 달렸어요");
  targets.delete(user.id);
  if (targets.size === 0) return NextResponse.json({ ok: true });

  const { data: blocks } = await db.from("community_blocks").select("auth_user_id").eq("blocked_user_id", user.id).in("auth_user_id", [...targets.keys()]);
  for (const b of blocks ?? []) targets.delete(b.auth_user_id);

  const excerpt = String(comment.content ?? "").slice(0, 60);
  after(async () => {
    for (const [id, title] of targets) await notifyGuest(id, { kind: "community_comment", title, body: `${comment.nickname ?? "이웃"}: ${excerpt}`, url: `/community/post/${comment.post_id}` });
  });
  return NextResponse.json({ ok: true });
}
