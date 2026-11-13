// 회원 제재 확인(서버 전용) — 후기·답글처럼 서버를 거쳐 쓰는 글에서 부릅니다.
// 커뮤니티 글·댓글은 화면이 DB에 바로 쓰므로 DB 장치(scripts/sql/member-sanctions.sql)가 막습니다.
// 제재 표가 아직 없으면(SQL 실행 전) 아무도 막지 않습니다.
import { db } from "@/lib/server/ownerStore";
import { isBlocking, type SanctionRow } from "@/lib/sanctions";

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
