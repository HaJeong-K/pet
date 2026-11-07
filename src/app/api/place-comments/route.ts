import { NextRequest, NextResponse } from "next/server";
import { db, userOf } from "@/lib/server/ownerStore";
import { checkCommentPassword, hashCommentPassword, isHashed } from "@/lib/server/commentPassword";

// /api/place-comments — 장소 후기(reviews)·답글(review_replies) 쓰기·고치기·지우기(2026-11-07)
//   비회원 비밀번호를 화면이 읽지 못하게 하려고 서버로 옮겼습니다. 비밀번호는 암호화해 저장하고, 확인도 여기서만 합니다.
//   회원 글은 로그인한 본인(또는 관리자)만 고치고 지울 수 있습니다.
//   POST   { kind: "review", placeId, nickname, content, password?, userKey? } | { kind: "reply", reviewId, ... }
//   PATCH  { kind, id, content, password? }
//   DELETE { kind, id, password? }

type Kind = "review" | "reply";
const TABLE: Record<Kind, string> = { review: "reviews", reply: "review_replies" };
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
  const row = kind === "review"
    ? { place_id: body.placeId, nickname, content, likes: 0, ...owner }
    : { review_id: body.reviewId, nickname, content, ...owner };
  const { error } = await db.from(TABLE[kind]).insert([row]);
  if (error) return fail("저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
  return NextResponse.json({ ok: true });
}

async function authorize(req: NextRequest, kind: Kind, id: unknown, password: string) {
  const { data: row } = await db.from(TABLE[kind]).select("id, auth_user_id, password").eq("id", id as never).maybeSingle();
  if (!row) return { error: fail("글을 찾을 수 없어요.", 404) };
  const user = await userOf(req);
  if (row.auth_user_id) {
    if (user && (user.id === row.auth_user_id || (await isAdmin(user.id)))) return { row };
    return { error: fail("본인이 쓴 글만 고칠 수 있어요.", 403) };
  }
  if (user && (await isAdmin(user.id))) return { row };
  // 비밀번호 없이 남겨진 아주 예전 비회원 글은 예전처럼 둡니다
  if (!row.password) return { row };
  if (!checkCommentPassword(password, row.password)) return { error: fail("비밀번호가 일치하지 않습니다.", 403) };
  // 예전 방식(그대로 저장)이었다면 이 기회에 암호화로 바꿔 둡니다
  if (!isHashed(row.password)) await db.from(TABLE[kind]).update({ password: hashCommentPassword(password) }).eq("id", row.id);
  return { row };
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
  const { error } = await db.from(TABLE[kind]).update({ deleted: true }).eq("id", auth.row.id);
  if (error) return fail("지우지 못했어요. 다시 시도해 주세요.", 500);
  return NextResponse.json({ ok: true });
}
