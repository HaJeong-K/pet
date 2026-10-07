import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { deleteAccount } from "@/lib/server/deleteAccount";

// 관리자 전용: 가입 회원 관리
//   GET                         → 가입 회원 목록 + 회원별 활동(후기·답글·글·댓글 수)과 신고받은 횟수, 관리자가 지운 글 수
//   POST { action: "remove", authUserId } → 강제 탈퇴(되돌릴 수 없음 — 관리자 본인·다른 관리자는 불가)
// 신고는 "어떤 글이 신고됐는지"만 저장돼 있어서, 그 글의 작성자를 찾아 회원별로 셉니다.

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** 한 번에 읽는 최대 행 수(지금 규모에서는 충분 — 넘으면 최근 것부터 셉니다) */
const MAX_ROWS = 5000;

type Counts = { reviews: number; replies: number; posts: number; comments: number; reported: number; reportedOpen: number; adminDeleted: number };
const empty = (): Counts => ({ reviews: 0, replies: 0, posts: 0, comments: 0, reported: 0, reportedOpen: 0, adminDeleted: 0 });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });

  const [users, reviews, replies, posts, comments, reports] = await Promise.all([
    supabaseAdmin.from("users").select("auth_user_id, email, nickname, avatar_url, created_at, is_admin, owner_status, owner_business_name").not("auth_user_id", "is", null).order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("reviews").select("id, auth_user_id, is_admin_deleted").not("auth_user_id", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("review_replies").select("id, auth_user_id, is_admin_deleted").not("auth_user_id", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_posts").select("id, auth_user_id, is_admin_deleted").not("auth_user_id", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_comments").select("id, author_auth_key, is_admin_deleted").not("author_auth_key", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("reports").select("type, target_id, board_post_id, is_resolved").neq("type", "place").order("created_at", { ascending: false }).limit(MAX_ROWS),
  ]);
  if (users.error) return NextResponse.json({ error: users.error.message }, { status: 500 });

  const byUser = new Map<string, Counts>();
  const of = (uid: string | null | undefined) => {
    if (!uid) return null;
    if (!byUser.has(uid)) byUser.set(uid, empty());
    return byUser.get(uid)!;
  };
  // 글 번호 → 작성자 (신고 대상의 작성자를 찾는 데 씁니다)
  const author = { review: new Map<string, string>(), reply: new Map<string, string>(), post: new Map<string, string>(), comment: new Map<string, string>() };
  for (const r of reviews.data ?? []) { const c = of(r.auth_user_id); if (c) { c.reviews++; if (r.is_admin_deleted) c.adminDeleted++; author.review.set(String(r.id), r.auth_user_id); } }
  for (const r of replies.data ?? []) { const c = of(r.auth_user_id); if (c) { c.replies++; if (r.is_admin_deleted) c.adminDeleted++; author.reply.set(String(r.id), r.auth_user_id); } }
  for (const r of posts.data ?? []) { const c = of(r.auth_user_id); if (c) { c.posts++; if (r.is_admin_deleted) c.adminDeleted++; author.post.set(String(r.id), r.auth_user_id); } }
  for (const r of comments.data ?? []) { const c = of(r.author_auth_key); if (c) { c.comments++; if (r.is_admin_deleted) c.adminDeleted++; author.comment.set(String(r.id), r.author_auth_key); } }

  for (const rp of reports.data ?? []) {
    const id = String(rp.target_id ?? "");
    const uid =
      rp.type === "review" ? author.review.get(id) :
      rp.type === "reply" ? author.reply.get(id) :
      rp.type === "community_post" ? author.post.get(id) ?? author.post.get(String(rp.board_post_id ?? "")) :
      rp.type === "community_comment" || rp.type === "community_reply" ? author.comment.get(id) :
      undefined;
    const c = of(uid);
    if (!c) continue;
    c.reported++;
    if (!rp.is_resolved) c.reportedOpen++;
  }

  const members = (users.data ?? []).map((u) => ({
    authUserId: u.auth_user_id as string,
    email: u.email as string | null,
    nickname: u.nickname as string | null,
    avatarUrl: u.avatar_url as string | null,
    createdAt: u.created_at as string | null,
    isAdmin: !!u.is_admin,
    ownerStatus: (u.owner_status as string | null) ?? null,
    ownerBusinessName: (u.owner_business_name as string | null) ?? null,
    ...(byUser.get(u.auth_user_id as string) ?? empty()),
  }));
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; authUserId?: string };
  if (body.action !== "remove" || !body.authUserId) return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
  if (body.authUserId === adminUser.id) return NextResponse.json({ error: "본인 계정은 여기서 탈퇴시킬 수 없어요." }, { status: 400 });

  const { data: target } = await supabaseAdmin.from("users").select("is_admin").eq("auth_user_id", body.authUserId).maybeSingle();
  if (!target) return NextResponse.json({ error: "회원을 찾을 수 없어요." }, { status: 404 });
  if (target.is_admin) return NextResponse.json({ error: "관리자 계정은 탈퇴시킬 수 없어요." }, { status: 400 });

  try {
    const result = await deleteAccount(body.authUserId, { unlinkKakao: true });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "탈퇴 처리에 실패했어요." }, { status: 500 });
  }
}
