// 가게 공지(사장님 소식) — 네이버 플레이스의 "알림/소식"과 같은 방식입니다.
//   · 장소 상세의 친화도 점수 바로 아래에 대표(고정) 공지 또는 최신 공지 한 줄, 누르면 지난 공지까지 모두
//   · 대표 공지는 한 가게에 하나, 지운 공지는 기록만 남고 손님에게는 안 보임
// 표는 scripts/sql/place-notices.sql, 서버는 /api/place-notices · /api/owner/notices.

export const NOTICE_TITLE_MAX = 60;
export const NOTICE_CONTENT_MAX = 2000;
/** 한 가게가 보여 줄 수 있는 공지 수(지운 것 제외) */
export const NOTICES_PER_PLACE_MAX = 100;

export type PlaceNotice = { id: number; title: string; content: string; pinned: boolean; created_at: string; updated_at: string };

/** 사장님이 보낸 공지를 다듬습니다. partial이면(고치기) 보낸 칸만 확인합니다. */
export function cleanNotice(raw: unknown, partial = false): { notice: Partial<Pick<PlaceNotice, "title" | "content" | "pinned">> } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<Pick<PlaceNotice, "title" | "content" | "pinned">> = {};
  if (!partial || r.title !== undefined) {
    const title = typeof r.title === "string" ? r.title.trim().replace(/\s+/g, " ") : "";
    if (!title) return { error: "공지 제목을 적어 주세요." };
    if (title.length > NOTICE_TITLE_MAX) return { error: `제목은 ${NOTICE_TITLE_MAX}자까지 적을 수 있어요.` };
    out.title = title;
  }
  if (!partial || r.content !== undefined) {
    const content = typeof r.content === "string" ? r.content.trim() : "";
    if (!content) return { error: "공지 내용을 적어 주세요." };
    if (content.length > NOTICE_CONTENT_MAX) return { error: `내용은 ${NOTICE_CONTENT_MAX}자까지 적을 수 있어요.` };
    out.content = content;
  }
  if (!partial || r.pinned !== undefined) out.pinned = r.pinned === true;
  return { notice: out };
}

/** 대표(고정) 공지 먼저, 그다음 최신순 */
export function sortNotices<T extends Pick<PlaceNotice, "pinned" | "created_at">>(notices: T[]): T[] {
  return [...notices].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
}

/** "10/28" (올해가 아니면 "2025/10/28") — 한국 시간 기준 */
export function noticeDate(iso: string, now = Date.now()): string {
  const kst = (t: number) => new Date(t + 9 * 3_600_000).toISOString();
  const d = kst(new Date(iso).getTime());
  const sameYear = d.slice(0, 4) === kst(now).slice(0, 4);
  return `${sameYear ? "" : `${d.slice(0, 4)}/`}${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

/** 최근 7일 안에 올린 공지면 "N" 표시 */
export function isNewNotice(iso: string, now = Date.now()): boolean {
  return now - new Date(iso).getTime() < 7 * 86_400_000;
}
