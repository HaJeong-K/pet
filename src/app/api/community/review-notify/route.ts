import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { notifyAdmin } from "@/lib/server/notify";
import { boardLabel } from "@/lib/communityBoards";

// POST /api/community/review-notify { postId }
// 글이 자동 검토 대상(review_status = 'pending')으로 저장됐을 때, 글을 쓴 화면이 이 주소를 불러
// 관리자에게 카카오톡 알림을 보냅니다. 판정 자체는 DB 트리거가 이미 끝낸 상태라(scripts/sql/post-review.sql)
// 여기서는 "정말 검토 대기 중인 글인지"만 서버가 다시 확인하고, 같은 글로 두 번 알리지 않습니다.
// (알림을 못 보내도 글은 검토 대기 목록에 남고, 아침 요약에도 건수가 들어갑니다.)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return NextResponse.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { postId?: number | string };
  const postId = Number(body.postId);
  if (!Number.isFinite(postId) || postId <= 0) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: post, error } = await supabaseAdmin
    .from("community_posts")
    .select("id, title, board_id, nickname, review_status, review_reason, review_notified_at")
    .eq("id", postId)
    .maybeSingle();
  // 컬럼이 아직 없거나(SQL 실행 전) 글이 없으면 조용히 끝냅니다.
  if (error || !post) return NextResponse.json({ ok: true, notified: false });
  if (post.review_status !== "pending" || post.review_notified_at) return NextResponse.json({ ok: true, notified: false });

  await supabaseAdmin.from("community_posts").update({ review_notified_at: new Date().toISOString() }).eq("id", postId);
  await notifyAdmin({
    title: "🔎 커뮤니티 글 검토 필요",
    lines: [
      `게시판: ${boardLabel(post.board_id)}`,
      `제목: ${String(post.title ?? "").slice(0, 40)}`,
      `사유: ${post.review_reason ?? "게시판 규칙 위반 의심"}`,
      `작성자: ${post.nickname ?? "알 수 없음"}`,
      "승인하기 전까지 공개되지 않아요.",
    ],
    path: "/admin/review",
  });
  return NextResponse.json({ ok: true, notified: true });
}
