import { describe, expect, it } from "vitest";
import { averageMetrics, buildInsights, changeText, countMetrics, emptyMetrics, scaleTo30, totals, weekdayViews, type ReportEvent } from "./ownerReport";

const day = 86_400_000;
const t0 = Date.parse("2026-10-01T03:00:00Z");
const ev = (event_type: string, place_id: number | null, at: number, meta?: unknown): ReportEvent => ({ event_type, place_id, created_at: new Date(at).toISOString(), meta });

describe("성과 보고서 지표 세기", () => {
  const events = [
    ev("place_view", 3, t0), ev("place_view", 3, t0 + day), ev("place_view", 9, t0),
    ev("course_impression", null, t0, { stops: [3, 7] }), ev("course_impression", null, t0, { stops: ["9"] }),
    ev("rec_impression", null, t0, { items: [{ id: 3 }, { id: 4 }] }),
    ev("place_call", 3, t0), ev("place_view", 3, t0 + 40 * day),
  ];
  it("가게별·기간별로 센다(코스·추천 노출은 기록 안의 목록으로)", () => {
    const m = countMetrics(events, 3, t0, t0 + 30 * day);
    expect([m.views, m.courseImpressions, m.recImpressions, m.calls]).toEqual([2, 1, 1, 1]);
    expect(countMetrics(events, 9, t0, t0 + 30 * day).courseImpressions).toBe(1);
    expect(totals(m)).toEqual({ exposure: 2, clicks: 0, actions: 1, views: 2 });
  });
  it("요일별 조회(한국 시간)", () => {
    // 2026-10-01은 목요일
    expect(weekdayViews(events, 3, t0, t0 + 30 * day)).toEqual([0, 0, 0, 0, 1, 1, 0]);
  });
});

describe("비교 계산", () => {
  it("30일 환산·평균·증감", () => {
    const m = { ...emptyMetrics(), views: 10 };
    expect(scaleTo30(m, 10).views).toBe(30);
    expect(averageMetrics([{ ...emptyMetrics(), views: 4 }, { ...emptyMetrics(), views: 7 }]).views).toBe(5.5);
    expect(changeText(15, 10)).toBe("+50%");
    expect(changeText(5, 10)).toBe("-50%");
    expect(changeText(3, 0)).toBe("새로 발생");
  });
  it("주요 성과·개선 제안을 자동으로 쓴다", () => {
    const cur = { ...emptyMetrics(), views: 30, courseImpressions: 12 };
    const out = buildInsights({ current: cur, previous: { ...emptyMetrics(), views: 20 }, peers: { ...emptyMetrics(), views: 10, courseImpressions: 2 }, beforePaid: { ...emptyMetrics(), views: 15 },
      hasPhoto: false, hasPhone: true, hasWebsite: true, reviewReplyRate: 50, isBannerPlan: false });
    expect(out.highlights.join(" ")).toContain("50% 늘었습니다");
    expect(out.highlights.join(" ")).toContain("무료로 이용하던 기간보다 상세 조회가 100% 많습니다");
    expect(out.highlights.join(" ")).toContain("비슷한 무료 업체 평균(10회)보다 상세 조회가 200% 많습니다");
    expect(out.suggestions.some((s) => s.includes("사진"))).toBe(true);
    expect(out.suggestions.some((s) => s.includes("답글률이 50%"))).toBe(true);
  });
});
