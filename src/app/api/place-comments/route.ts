import { NextRequest, NextResponse } from "next/server";
import { db, userOf } from "@/lib/server/ownerStore";
import { checkCommentPassword, hashCommentPassword, isHashed } from "@/lib/server/commentPassword";

// /api/place-comments — 장소 후기(reviews)·답글(review_replies)의 모든 쓰기를 여기서만 합니다(2026-11-07)
//   · 비회원 비밀번호는 암호화해 저장하고 확인도 여기서만 합니다(화면은 비밀번호 칸을 읽지 못함).
//   · 회원 글은 로그인한 본인(또는 관리자)만 고치고 지울 수 있습니다.
//   · DB 규칙(scripts/sql/lock-place-comments.sql)으로 화면에서 후기 표에 직접 쓰는 길은 막습니다.
//   POST   { kind: "review", placeId, nickname, content, password?, userKey? } | { kind: "reply", reviewId, ... }
//   PATCH  { kind, id, content, password? }                       — 내용 고치기
//   DELETE { kind, id, password?, admin?: true, adminContent? }   — 지우기(관리자는 "관리자 삭제" 표시)
//   PUT    { kind, id, like: boolean, userKey? }                  — 좋아요 누르기/취소(실제 좋아요 수로 다시 셈)

type Kind = "review" | "reply";
const TABLE: Record<Kind, string> = { review: "reviews", reply: "review_replies" };
const LIKES: Record<Kind, { table: string; col: string }> = { review: { table: "review_likes", col: "review_id" }, reply: { table: "reply_likes", col: "reply_id" } };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const kindOf = (v: unknown): Kind | null => (v === "review" || v === "reply" ? v : null);

async function isAdmin(userId: string) {
  const { data } = await db.from("users").select("is_admin").eq("auth_user_id", userId).maybeSingle();
  return !!data?.is_admin;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = kindOf(body?.kind);
  if (!kind) return fail("잘못된 요청이에요.", 400);
  if (kind === "review" && (body?.placeId == null || body?.placeId === "")) return fail("장소를 찾을 수 없어요.", 400);
  if (kind === "reply" && !body?.reviewId) return fail("댓글을 찾을 수 없어요.", 400);
  const user = await userOf(req);
  const nickname = text(body?.nickname, 30);
  const content = text(body?.content, 2000);
  const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
  if (!nickname || !content) return fail("닉네임과 내용을 입력해 주세요.", 400);
  if (!user && !password) return fail("비밀번호를 입력해 주세요.", 400);
  const owner = user
    ? { auth_user_id: user.id, user_key: null, password: null }
    : { auth_user_id: null, user_key: text(body?.userKey, 80) || null, password: hashCommentPassword(password) };

  let row: Record<string, unknown>;
  if (kind === "review") {
    row = { place_id: body.placeId, nickname, content, likes: 0, ...owner };
  } else {
    const { data: parent } = await db.from("reviews").select("place_id").eq("id", body.reviewId).maybeSingle();
    if (!parent) return fail("댓글을 찾을 수 없어요.", 404);
    // 그 장소의 인증된 사장님이 쓴 답글이면 "사장님" 표시(예전에 DB 장치가 하던 일 — 서버로 쓰면 장치가 건너뛰어져 여기서 판단)
    let isOwner = false;
    if (user) {
      const { data: me } = await db.from("users").select("owner_status, owner_place_id").eq("auth_user_id", user.id).maybeSingle();
      isOwner = me?.owner_status === "verified" && me?.owner_place_id != null && String(me.owner_place_id) === String(parent.place_id);
    }
    row = { review_id: body.reviewId, nickname, content, is_owner: isOwner, ...owner };
  }
  const { error } = await db.from(TABLE[kind]).insert([row]);
  if (error) return fail("저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
  return NextResponse.json({ ok: true });
}

async function authorize(req: NextRequest, kind: Kind, id: unknown, password: string) {
  const { data: row } = await db.from(TABLE[kind]).select("id, auth_user_id, password").eq("id", id as never).maybeSingle();
  if (!row) return { error: fail("글을 찾을 수 없어요.", 404) };
  const user = await userOf(req);
  const admin = !!user && (await isAdmin(user.id));
  if (row.auth_user_id) {
    if (user && (user.id === row.auth_user_id || admin)) return { row, admin };
    return { error: fail("본인이 쓴 글만 고칠 수 있어요.", 403) };
  }
  if (admin) return { row, admin };
  // 비밀번호 없이 남겨진 아주 예전 비회원 글은 예전처럼 둡니다
  if (!row.password) return { row, admin };
  if (!checkCommentPassword(password, row.password)) return { error: fail("비밀번호가 일치하지 않습니다.", 403) };
  // 예전 방식(그대로 저장)이었다면 이 기회에 암호화로 바꿔 둡니다
  if (!isHashed(row.password)) await db.from(TABLE[kind]).update({ password: hashCommentPassword(password) }).eq("id", row.id);
  return { row, admin };
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = kindOf(body?.kind);
  const content = text(body?.content, 2000);
  if (!kind || !content) return fail("내용을 입력해 주세요.", 400);
  const auth = await authorize(req, kind, body?.id, typeof body?.password === "string" ? body.password : "");
  if ("error" in auth) return auth.error;
  const { error } = await db.from(TABLE[kind]).update({ content, is_edited: true }).eq("id", auth.row.id);
  if (error) return fail("저장하지 못했어요. 다시 시도해 주세요.", 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = kindOf(body?.kind);
  if (!kind) return fail("잘못된 요청이에요.", 400);
  const auth = await authorize(req, kind, body?.id, typeof body?.password === "string" ? body.password : "");
  if ("error" in auth) return auth.error;
  let patch: Record<string, unknown> = { deleted: true };
  if (body?.admin === true) {
    if (!auth.admin) return fail("관리자만 할 수 있어요.", 403);
    patch = { deleted: true, is_admin_deleted: true, ...(typeof body.adminContent === "string" && body.adminContent ? { content: body.adminContent.slice(0, 200) } : {}) };
  }
  const { error } = await db.from(TABLE[kind]).update(patch).eq("id", auth.row.id);
  if (error) return fail("지우지 못했어요. 다시 시도해 주세요.", 500);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = kindOf(body?.kind);
  if (!kind || body?.id == null) return fail("잘못된 요청이에요.", 400);
  const user = await userOf(req);
  const who = user?.id ?? text(body?.userKey, 80);
  if (!who) return fail("잘못된 요청이에요.", 400);
  const { table, col } = LIKES[kind];
  if (body.like === true) {
    // 같은 사람이 두 번 눌러도 한 번만 셉니다(좋아요 표에 중복 막는 규칙이 없어 먼저 확인)
    const { data: mine } = await db.from(table).select("id").eq(col, body.id).eq("user_key", who).limit(1);
    if (!mine?.length) {
      const { error } = await db.from(table).insert([{ [col]: body.id, user_key: who }]);
      if (error) return fail("반영하지 못했어요.", 500);
    }
  } else {
    await db.from(table).delete().eq(col, body.id).eq("user_key", who);
  }
  // 저장된 숫자 대신 실제 좋아요 수로 다시 셉니다
  const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq(col, body.id);
  const likes = count ?? 0;
  await db.from(TABLE[kind]).update({ likes }).eq("id", body.id);
  return NextResponse.json({ ok: true, likes });
}
