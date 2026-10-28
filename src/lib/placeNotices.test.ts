import { describe, expect, it } from "vitest";
import { cleanNotice, isNewNotice, noticeDate, sortNotices } from "./placeNotices";

describe("공지 다듬기", () => {
  it("제목·내용 필수, 공백 정리", () => {
    expect(cleanNotice({ title: "  11월   휴무 안내 ", content: " 11/3은 쉽니다 ", pinned: true })).toEqual({ notice: { title: "11월 휴무 안내", content: "11/3은 쉽니다", pinned: true } });
    expect("error" in cleanNotice({ title: "", content: "내용" })).toBe(true);
    expect("error" in cleanNotice({ title: "제목", content: "  " })).toBe(true);
    expect("error" in cleanNotice({ title: "가".repeat(61), content: "내용" })).toBe(true);
  });
  it("고치기는 보낸 칸만", () => {
    expect(cleanNotice({ pinned: false }, true)).toEqual({ notice: { pinned: false } });
    expect("error" in cleanNotice({ title: "" }, true)).toBe(true);
  });
});

describe("공지 순서·날짜", () => {
  it("고정 먼저, 그다음 최신순", () => {
    const list = sortNotices([
      { id: 1, pinned: false, created_at: "2026-10-01T00:00:00Z" },
      { id: 2, pinned: true, created_at: "2026-09-01T00:00:00Z" },
      { id: 3, pinned: false, created_at: "2026-10-20T00:00:00Z" },
    ]);
    expect(list.map((n) => n.id)).toEqual([2, 3, 1]);
  });
  it("올해면 월/일, 아니면 연도까지(한국 시간)", () => {
    const now = Date.parse("2026-10-28T03:00:00Z");
    expect(noticeDate("2026-10-27T16:00:00Z", now)).toBe("10/28");
    expect(noticeDate("2025-12-01T00:00:00Z", now)).toBe("2025/12/1");
    expect(isNewNotice("2026-10-25T00:00:00Z", now)).toBe(true);
    expect(isNewNotice("2026-10-01T00:00:00Z", now)).toBe(false);
  });
});
