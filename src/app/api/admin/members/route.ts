import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { deleteAccount } from "@/lib/server/deleteAccount";
import { isMissingOwnerKind, ownerKindOf } from "@/lib/ownerKind";
import { APPEAL_DAYS, countsAsStrike, isBlocking, nextSanction, type SanctionRow } from "@/lib/sanctions";
import { notifyGuest } from "@/lib/server/guestNotify";

// 관리자 전용: 가입 회원 관리
//   GET                         → 가입 회원 목록 + 회원별 활동(후기·답글·글·댓글 수)과 신고받은 횟수, 관리자가 지운 글 수
//   POST { action: "remove", authUserId } → 강제 탈퇴(되돌릴 수 없음 — 관리자 본인·다른 관리자는 불가)
//   POST { action: "sanction", authUserId, reason, severe? } → 위반 1회 기록 + 단계별 제재(경고 → 7일 → 30일 → 영구, src/lib/sanctions.ts). 회원에게 알림
//   POST { action: "lift", authUserId, reason } → 진행 중인 제재 해제(이의 인정 — 위반 횟수에서도 빠짐)
//   제재 표: scripts/sql/member-sanctions.sql (실행 전이면 제재 기능만 꺼져 있음)
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

  const userColumns = "auth_user_id, email, nickname, avatar_url, created_at, is_admin, owner_status, owner_business_name";
  const usersQuery = (columns: string) => supabaseAdmin.from("users").select(columns).not("auth_user_id", "is", null).order("created_at", { ascending: false }).limit(MAX_ROWS).returns<Record<string, unknown>[]>();
  const [firstUsers, reviews, replies, posts, comments, reports] = await Promise.all([
    usersQuery(`${userColumns}, owner_kind`),
    supabaseAdmin.from("reviews").select("id, auth_user_id, is_admin_deleted").not("auth_user_id", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("review_replies").select("id, auth_user_id, is_admin_deleted").not("auth_user_id", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_posts").select("id, author_auth_key, is_admin_deleted").not("author_auth_key", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_comments").select("id, author_auth_key, is_admin_deleted").not("author_auth_key", "is", null).order("id", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("reports").select("type, target_id, board_post_id, is_resolved").neq("type", "place").order("created_at", { ascending: false }).limit(MAX_ROWS),
  ]);
  // 사장님 유형 칸(scripts/sql/owner-kind.sql) 실행 전이면 유형 없이 불러옵니다(모두 가게로 표시)
  const users = isMissingOwnerKind(firstUsers.error) ? await usersQuery(userColumns) : firstUsers;
  if (users.error) return NextResponse.json({ error: users.error.message }, { status: 500 });
  // 회원 레벨(레벨 표가 아직 없으면 빈 채로 — 화면에서는 표시하지 않습니다)
  const levelRows = await supabaseAdmin.from("member_levels").select("auth_user_id, level, points");
  const levelOf = new Map<string, { level: number; points: number }>();
  for (const row of levelRows.data ?? []) levelOf.set(row.auth_user_id as string, { level: row.level as number, points: row.points as number });

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
  // ⚠ 커뮤니티 글의 글쓴이는 author_auth_key 칸에 들어 있습니다(auth_user_id 칸은 비어 있어, 예전에는 글 수가 늘 0이었습니다).
  for (const r of posts.data ?? []) { const c = of(r.author_auth_key); if (c) { c.posts++; if (r.is_admin_deleted) c.adminDeleted++; author.post.set(String(r.id), r.author_auth_key); } }
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

  // 제재 기록(표가 아직 없으면 빈 채로 — sanctionsReady: false)
  const sanctionRows = await supabaseAdmin.from("member_sanctions").select("auth_user_id, stage, days, reason, ends_at, lifted_at, created_at").order("created_at", { ascending: false }).limit(MAX_ROWS);
  const sanctionsReady = !sanctionRows.error;
  const sanctionsOf = new Map<string, (SanctionRow & { reason: string; days: number | null })[]>();
  for (const row of sanctionRows.data ?? []) {
    const list = sanctionsOf.get(row.auth_user_id as string) ?? [];
    list.push(row as SanctionRow & { reason: string; days: number | null });
    sanctionsOf.set(row.auth_user_id as string, list);
  }
  const sanctionInfo = (uid: string) => {
    const list = sanctionsOf.get(uid) ?? [];
    const strikes = list.filter((r) => countsAsStrike(r)).length;
    const blocking = list.filter((r) => isBlocking(r));
    const ban = blocking.find((r) => r.stage === "ban");
    const until = blocking.filter((r) => r.stage === "suspend").map((r) => r.ends_at as string).sort().pop() ?? null;
    return {
      strikes,
      blocked: ban ? "ban" as const : until ? "suspend" as const : null,
      blockedUntil: ban ? null : until,
      nextLabel: nextSanction(strikes).label,
      history: list.slice(0, 5).map((r) => ({ stage: r.stage, days: r.days, reason: r.reason, createdAt: r.created_at, endsAt: r.ends_at, liftedAt: r.lifted_at })),
    };
  };

  const members = (users.data ?? []).map((u) => ({
    authUserId: u.auth_user_id as string,
    email: u.email as string | null,
    nickname: u.nickname as string | null,
    avatarUrl: u.avatar_url as string | null,
    createdAt: u.created_at as string | null,
    isAdmin: !!u.is_admin,
    ownerStatus: (u.owner_status as string | null) ?? null,
    ownerBusinessName: (u.owner_business_name as string | null) ?? null,
    ownerKind: ownerKindOf(u.owner_kind),
    level: levelOf.get(u.auth_user_id as string)?.level ?? null,
    points: levelOf.get(u.auth_user_id as string)?.points ?? null,
    ...(byUser.get(u.auth_user_id as string) ?? empty()),
    sanction: sanctionInfo(u.auth_user_id as string),
  }));
  return NextResponse.json({ members, sanctionsReady });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; authUserId?: string; reason?: string; severe?: boolean };
  if (!["remove", "sanction", "lift"].includes(body.action ?? "") || !body.authUserId) return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
  if (body.authUserId === adminUser.id) return NextResponse.json({ error: "본인 계정에는 할 수 없어요." }, { status: 400 });

  const { data: target } = await supabaseAdmin.from("users").select("is_admin").eq("auth_user_id", body.authUserId).maybeSingle();
  if (!target) return NextResponse.json({ error: "회원을 찾을 수 없어요." }, { status: 404 });
  if (target.is_admin) return NextResponse.json({ error: "관리자 계정에는 할 수 없어요." }, { status: 400 });

  if (body.action === "sanction" || body.action === "lift") {
    const reason = (body.reason ?? "").trim().slice(0, 300);
    if (reason.length < 2) return NextResponse.json({ error: "사유를 적어 주세요." }, { status: 400 });
    const NEED_SQL = "제재 표가 아직 없어요. scripts/sql/member-sanctions.sql을 먼저 실행해 주세요.";
    const { data: rows, error: readError } = await supabaseAdmin.from("member_sanctions").select("id, stage, ends_at, lifted_at, created_at").eq("auth_user_id", body.authUserId);
    if (readError) return NextResponse.json({ error: NEED_SQL }, { status: 503 });
    const list = (rows ?? []) as (SanctionRow & { id: number })[];

    if (body.action === "lift") {
      const active = list.filter((r) => isBlocking(r)).map((r) => r.id);
      if (active.length === 0) return NextResponse.json({ error: "진행 중인 제재가 없어요." }, { status: 400 });
      const { error } = await supabaseAdmin.from("member_sanctions").update({ lifted_at: new Date().toISOString(), lift_reason: reason }).in("id", active);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await notifyGuest(body.authUserId, { kind: "sanction", title: "이용 제한이 해제됐어요", body: `다시 글을 쓸 수 있어요. (${reason})`, url: "/mypage" });
      return NextResponse.json({ ok: true });
    }

    const step = nextSanction(list.filter((r) => countsAsStrike(r)).length, !!body.severe);
    const endsAt = step.stage === "suspend" && step.days ? new Date(Date.now() + step.days * 86_400_000).toISOString() : null;
    const { error } = await supabaseAdmin.from("member_sanctions").insert({
      auth_user_id: body.authUserId, stage: step.stage, days: step.days, reason, severe: !!body.severe, ends_at: endsAt, created_by: adminUser.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const appeal = `이의가 있으면 ${APPEAL_DAYS}일 안에 문의하기로 알려 주세요.`;
    const notice =
      step.stage === "warning" ? { title: "운영정책 위반 경고", body: `사유: ${reason} · 같은 위반이 반복되면 글쓰기가 제한돼요. ${appeal}` } :
      step.stage === "suspend" ? { title: `${step.days}일 동안 글쓰기가 제한돼요`, body: `사유: ${reason} · 글·댓글·후기 작성이 ${step.days}일 동안 제한돼요. ${appeal}` } :
      { title: "글쓰기가 영구 제한됐어요", body: `사유: ${reason} · 글·댓글·후기 작성이 영구 제한돼요. ${appeal}` };
    await notifyGuest(body.authUserId, { kind: "sanction", ...notice, url: "/mypage" });
    return NextResponse.json({ ok: true, applied: step.label });
  }

  try {
    const result = await deleteAccount(body.authUserId, { unlinkKakao: true });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "탈퇴 처리에 실패했어요." }, { status: 500 });
  }
}
