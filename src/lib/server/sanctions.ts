// 회원 제재 확인(서버 전용) — 후기·답글처럼 서버를 거쳐 쓰는 글에서 부릅니다.
// 커뮤니티 글·댓글은 화면이 DB에 바로 쓰므로 DB 장치(scripts/sql/member-sanctions.sql)가 막습니다.
// 제재 표가 아직 없으면(SQL 실행 전) 아무도 막지 않습니다.
import { db } from "@/lib/server/ownerStore";
import { APPEAL_DAYS, countsAsStrike, isBlocking, nextSanction, type SanctionRow } from "@/lib/sanctions";
import { notifyGuest } from "@/lib/server/guestNotify";

const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

/** 지금 글쓰기가 제한된 회원이면 안내 문구, 아니면 null */
export async function writeBlockMessage(authUserId: string | null | undefined): Promise<string | null> {
  if (!authUserId) return null;
  const { data, error } = await db.from("member_sanctions").select("stage, ends_at, lifted_at, created_at").eq("auth_user_id", authUserId).is("lifted_at", null).in("stage", ["suspend", "ban"]);
  if (error || !data) return null;
  const rows = (data as SanctionRow[]).filter((r) => isBlocking(r));
  if (rows.length === 0) return null;
  if (rows.some((r) => r.stage === "ban")) return "운영정책 위반으로 글쓰기가 영구 제한된 계정이에요. 이의가 있으면 문의하기로 알려 주세요.";
  const until = rows.map((r) => r.ends_at as string).sort().pop() as string;
  return `운영정책 위반으로 ${fmt(until)}까지 글쓰기가 제한돼 있어요. 이의가 있으면 문의하기로 알려 주세요.`;
}

export const NEED_SANCTION_SQL = "제재 표가 아직 없어요. scripts/sql/member-sanctions.sql을 먼저 실행해 주세요.";

/** 지금 작성이 막힌 회원들(여러 명을 한 번에 확인) */
export async function blockedUsers(authUserIds: string[]): Promise<Set<string>> {
  if (authUserIds.length === 0) return new Set();
  const { data } = await db.from("member_sanctions").select("auth_user_id, stage, ends_at, lifted_at, created_at").in("auth_user_id", authUserIds).is("lifted_at", null).in("stage", ["suspend", "ban"]);
  return new Set(((data ?? []) as (SanctionRow & { auth_user_id: string })[]).filter((r) => isBlocking(r)).map((r) => r.auth_user_id));
}

/**
 * 위반 1회 기록 + 단계에 맞는 제재(경고 → 7일 → 30일 → 영구). 회원에게 사유를 알립니다.
 * 관리자 회원 화면·신고 화면·숙박 후기 신고가 모두 이 함수 하나를 씁니다.
 */
export async function applySanction(input: { authUserId: string; reason: string; severe?: boolean; adminId?: string | null }): Promise<{ ok: true; applied: string } | { ok: false; error: string; status: number }> {
  const { data: rows, error: readError } = await db.from("member_sanctions").select("stage, ends_at, lifted_at, created_at").eq("auth_user_id", input.authUserId);
  if (readError) return { ok: false, error: NEED_SANCTION_SQL, status: 503 };
  const step = nextSanction(((rows ?? []) as SanctionRow[]).filter((r) => countsAsStrike(r)).length, !!input.severe);
  const endsAt = step.stage === "suspend" && step.days ? new Date(Date.now() + step.days * 86_400_000).toISOString() : null;
  const { error } = await db.from("member_sanctions").insert({
    auth_user_id: input.authUserId, stage: step.stage, days: step.days, reason: input.reason, severe: !!input.severe, ends_at: endsAt, created_by: input.adminId ?? null,
  });
  if (error) return { ok: false, error: error.message, status: 500 };
  const appeal = `이의가 있으면 ${APPEAL_DAYS}일 안에 문의하기로 알려 주세요.`;
  const notice =
    step.stage === "warning" ? { title: "운영정책 위반 경고", body: `사유: ${input.reason} · 같은 위반이 반복되면 글쓰기가 제한돼요. ${appeal}` } :
    step.stage === "suspend" ? { title: `${step.days}일 동안 글쓰기가 제한돼요`, body: `사유: ${input.reason} · 글·댓글·후기 작성이 ${step.days}일 동안 제한돼요. ${appeal}` } :
    { title: "글쓰기가 영구 제한됐어요", body: `사유: ${input.reason} · 글·댓글·후기 작성이 영구 제한돼요. ${appeal}` };
  await notifyGuest(input.authUserId, { kind: "sanction", ...notice, url: "/mypage" });
  return { ok: true, applied: step.label };
}

/** 신고된 글의 작성자(회원) 찾기 — 비회원 글이면 null */
export async function authorOfContent(type: string, id: string): Promise<string | null> {
  const pick = async (table: string, column: string) => {
    const { data } = await db.from(table).select(column).eq("id", id).maybeSingle();
    return ((data as Record<string, unknown> | null)?.[column] as string | null) ?? null;
  };
  if (type === "review") return pick("reviews", "auth_user_id");
  if (type === "reply") return pick("review_replies", "auth_user_id");
  if (type === "community_post") return pick("community_posts", "author_auth_key");
  if (type === "community_comment" || type === "community_reply") return pick("community_comments", "author_auth_key");
  return null;
}
