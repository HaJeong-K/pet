import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";

// 관리자 전용: 자동 검토에 걸린 커뮤니티 글 확인
//   GET                      → 검토 대기 글 목록(+ 최근 반려한 글)
//   POST { postId, action }  → action: "approve"(게시) | "reject"(반려 — 공개하지 않음)
// 승인·반려는 서버 권한(service role)으로만 바꿀 수 있습니다 — 작성자가 브라우저에서 직접 바꾸는 것은 DB 트리거가 막습니다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const COLUMNS = "id, title, content, nickname, board_id, post_type, image_urls, created_at, review_status, review_reason";
const notReady = (message: string) => /review_status|review_reason/.test(message);

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const { data: pending, error } = await supabaseAdmin
    .from("community_posts").select(COLUMNS).eq("review_status", "pending").eq("deleted", false).order("created_at", { ascending: true }).limit(100);
  if (error) {
    // 아직 SQL(scripts/sql/post-review.sql)을 실행하지 않은 상태
    if (notReady(error.message)) return NextResponse.json({ ready: false, pending: [], rejected: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: rejected } = await supabaseAdmin
    .from("community_posts").select(COLUMNS).eq("review_status", "rejected").eq("deleted", false).order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ ready: true, pending: pending ?? [], rejected: rejected ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { postId?: number; action?: string };
  const postId = Number(body.postId);
  if (!Number.isFinite(postId) || postId <= 0) return NextResponse.json({ error: "postId required" }, { status: 400 });
  if (body.action !== "approve" && body.action !== "reject") return NextResponse.json({ error: "action required" }, { status: 400 });

  const update = body.action === "approve"
    ? { review_status: "visible", review_reason: null }
    : { review_status: "rejected" };
  const { error } = await supabaseAdmin.from("community_posts").update(update).eq("id", postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
