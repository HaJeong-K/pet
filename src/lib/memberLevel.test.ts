import { describe, expect, it } from "vitest";
import { earnedLevel, MEMBER_LEVELS, POINT_RULES, scoreActivities, updateLevel, visitsByMonth, type Activity, type LevelState } from "./memberLevel";

const day = (d: number, hour = 12) => `2026-10-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+09:00`;
const many = (type: Activity["type"], n: number, at: string): Activity[] => Array.from({ length: n }, () => ({ type, at }));
/** 달성 단계가 6(명예 순찰대)인 점수·기여 */
const top = { points: 5000, mapContributions: 30 };
const mid = (month: string) => `${month}-15T12:00:00+09:00`;
/** 6단계에서 2026-06에 시작한 회원 */
const startedAt6: LevelState = { level: 6, earnedLevel: 6, evaluatedMonth: "2026-06", startedMonth: "2026-06" };

describe("회원 레벨 — 단계 구성", () => {
  it("6단계이고 이름이 정해진 순서대로다", () => {
    expect(MEMBER_LEVELS.map((l) => l.name)).toEqual(["꼬물이", "냄새 수집가", "거리 수색대", "산책대장", "발도장 수집가", "명예 순찰대"]);
    expect(MEMBER_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("단계가 높을수록 점수와 한 달 방문 조건이 높아진다", () => {
    for (let i = 1; i < MEMBER_LEVELS.length; i++) {
      expect(MEMBER_LEVELS[i].minPoints).toBeGreaterThan(MEMBER_LEVELS[i - 1].minPoints);
      expect(MEMBER_LEVELS[i].monthlyVisits).toBeGreaterThan(MEMBER_LEVELS[i - 1].monthlyVisits);
      expect(MEMBER_LEVELS[i].minMapContributions).toBeGreaterThanOrEqual(MEMBER_LEVELS[i - 1].minMapContributions);
    }
    expect(MEMBER_LEVELS[0]).toMatchObject({ minPoints: 0, monthlyVisits: 0 });
  });
});

describe("회원 레벨 — 달성 단계(점수·지도 기여)", () => {
  it("점수에 맞는 단계", () => {
    expect(earnedLevel(0).name).toBe("꼬물이");
    expect(earnedLevel(29).level).toBe(1);
    expect(earnedLevel(30).level).toBe(2);
    expect(earnedLevel(200).level).toBe(3);
    expect(earnedLevel(-5).level).toBe(1);
    expect(earnedLevel(NaN).level).toBe(1);
  });

  it("가장 높은 두 단계는 지도 기여가 있어야 한다(글·댓글만으로는 4단계까지)", () => {
    expect(earnedLevel(50_000, 0).level).toBe(4);
    expect(earnedLevel(50_000, 2).level).toBe(4);
    expect(earnedLevel(50_000, 3).level).toBe(5);
    expect(earnedLevel(50_000, 9).level).toBe(5);
    expect(earnedLevel(50_000, 10).level).toBe(6);
  });

  it("처음 받는 레벨은 달성 단계에서 시작하고, 다음 단계까지 남은 것을 알려 준다", () => {
    const p = updateLevel(null, { points: 200, now: mid("2026-10") });
    expect(p.current.level).toBe(3);
    expect(p.state).toEqual({ level: 3, earnedLevel: 3, evaluatedMonth: "2026-10", startedMonth: "2026-10" });
    expect(p.next?.level).toBe(4);
    expect(p.pointsToNext).toBe(100);
    expect(p.progress).toBeCloseTo(0.5, 5);
    const stuck = updateLevel(null, { points: 50_000, now: mid("2026-10") });
    expect(stuck.pointsToNext).toBe(0);
    expect(stuck.mapContributionsToNext).toBe(3);
  });

  it("최고 단계에서는 다음 단계가 없다", () => {
    const p = updateLevel(null, { ...top, now: mid("2026-10") });
    expect(p.current.level).toBe(6);
    expect(p.next).toBeNull();
    expect(p.progress).toBe(1);
  });
});

describe("회원 레벨 — 한 달에 한 단계씩만 내려간다", () => {
  it("지난달 방문 조건을 채웠으면 그대로다", () => {
    const p = updateLevel(startedAt6, { ...top, visits: { "2026-07": 16 }, now: mid("2026-08") });
    expect(p.current.level).toBe(6);
    expect(p.droppedNow).toBe(0);
    expect(p.demoted).toBe(false);
  });

  it("지난달 방문이 모자라면 딱 한 단계만 내려간다(아무리 적게 왔어도)", () => {
    const p = updateLevel(startedAt6, { ...top, visits: { "2026-07": 0 }, now: mid("2026-08") });
    expect(p.current.level).toBe(5);
    expect(p.droppedNow).toBe(1);
    expect(p.earned.level).toBe(6);
    expect(p.demoted).toBe(true);
  });

  it("같은 달에 여러 번 계산해도 한 번만 내려간다", () => {
    const first = updateLevel(startedAt6, { ...top, visits: { "2026-07": 3 }, now: mid("2026-08") });
    const again = updateLevel(first.state, { ...top, visits: { "2026-07": 3 }, now: "2026-08-28T09:00:00+09:00" });
    expect(first.current.level).toBe(5);
    expect(again.current.level).toBe(5);
    expect(again.droppedNow).toBe(0);
  });

  it("여러 달을 쉬면 달마다 한 단계씩 내려간다", () => {
    // 7·8·9월을 통째로 쉬고 10월에 돌아옴 → 6 → 5 → 4 → 3
    const p = updateLevel(startedAt6, { ...top, visits: {}, now: mid("2026-10") });
    expect(p.droppedNow).toBe(3);
    expect(p.current.level).toBe(3);
  });

  it("내려간 뒤에는 내려간 단계의 조건으로 심사한다", () => {
    // 7월 0일 → 5단계. 8월 13일 방문은 5단계 조건(12일)을 채우므로 9월에 더 내려가지 않는다.
    const p = updateLevel(startedAt6, { ...top, visits: { "2026-08": 13 }, now: "2026-09-02T12:00:00+09:00" });
    expect(p.current.level).toBe(5);
    expect(p.droppedNow).toBe(1);
  });

  it("레벨을 처음 받은 달은 심사하지 않는다(중간에 시작했으므로)", () => {
    const p = updateLevel(startedAt6, { ...top, visits: { "2026-06": 1 }, now: mid("2026-07") });
    expect(p.current.level).toBe(6);
  });

  it("1단계 아래로는 내려가지 않는다", () => {
    const low: LevelState = { level: 2, earnedLevel: 2, evaluatedMonth: "2026-01", startedMonth: "2026-01" };
    const p = updateLevel(low, { points: 40, visits: {}, now: mid("2026-10") });
    expect(p.current.level).toBe(1);
  });

  it("연말을 넘어가도 달을 올바르게 센다", () => {
    const state: LevelState = { level: 6, earnedLevel: 6, evaluatedMonth: "2026-11", startedMonth: "2026-06" };
    const p = updateLevel(state, { ...top, visits: { "2026-11": 16, "2026-12": 2 }, now: mid("2027-01") });
    expect(p.current.level).toBe(5);
    expect(p.state.evaluatedMonth).toBe("2027-01");
  });
});

describe("회원 레벨 — 다시 올라가기", () => {
  const demoted: LevelState = { level: 4, earnedLevel: 6, evaluatedMonth: "2026-10", startedMonth: "2026-06" };

  it("이번 달 방문이 윗단계 조건을 채우면 기다리지 않고 바로 올라간다", () => {
    expect(updateLevel(demoted, { ...top, visits: { "2026-10": 11 }, now: mid("2026-10") }).current.level).toBe(4);
    const up = updateLevel(demoted, { ...top, visits: { "2026-10": 12 }, now: mid("2026-10") });
    expect(up.current.level).toBe(5);
    expect(up.raisedNow).toBe(1);
    expect(updateLevel(demoted, { ...top, visits: { "2026-10": 16 }, now: mid("2026-10") }).current.level).toBe(6);
  });

  it("달성 단계보다 높이 올라가지는 않는다", () => {
    const p = updateLevel({ ...demoted, level: 3, earnedLevel: 4 }, { points: 400, visits: { "2026-10": 30 }, now: mid("2026-10") });
    expect(p.current.level).toBe(4);
  });

  it("새 단계를 처음 달성하면 바로 그 단계가 된다", () => {
    const state: LevelState = { level: 3, earnedLevel: 3, evaluatedMonth: "2026-10", startedMonth: "2026-09" };
    const p = updateLevel(state, { points: 320, visits: { "2026-10": 1 }, now: mid("2026-10") });
    expect(p.current.level).toBe(4);
    expect(p.state.earnedLevel).toBe(4);
  });

  it("지키거나 올라가려면 이번 달에 며칠 더 와야 하는지 알려 준다", () => {
    const p = updateLevel(demoted, { ...top, visits: { "2026-10": 5 }, now: mid("2026-10") });
    expect(p.visitsThisMonth).toBe(5);
    expect(p.visitsToKeep).toBe(3); // 4단계 유지: 8일
    expect(p.visitsToRecover).toBe(7); // 5단계로: 12일
  });
});

describe("회원 레벨 — 방문 일수 세기", () => {
  it("같은 날 여러 번 와도 하루로 세고, 달별로 나눈다(한국 시간)", () => {
    const visits = [
      "2026-10-20T09:00:00+09:00",
      "2026-10-20T21:00:00+09:00", // 같은 날
      "2026-10-01T00:30:00+09:00", // 한국 시간으로 10월 1일(UTC로는 9월 30일)
      "2026-09-30T23:50:00+09:00",
      "엉뚱한 값",
    ];
    expect(visitsByMonth(visits)).toEqual({ "2026-10": 2, "2026-09": 1 });
  });
});

describe("회원 레벨 — 점수", () => {
  it("지도에 도움이 되는 기여가 가장 크다", () => {
    expect(POINT_RULES.tip_approved.points).toBeGreaterThan(POINT_RULES.review.points);
    expect(POINT_RULES.review.points).toBeGreaterThan(POINT_RULES.post.points);
    expect(POINT_RULES.post.points).toBeGreaterThan(POINT_RULES.comment.points);
  });

  it("제보 승인 1건 + 사진 후기 1건 = 65점", () => {
    const s = scoreActivities([{ type: "tip_approved", at: day(1) }, { type: "review", at: day(1) }, { type: "review_photo", at: day(1) }]);
    expect(s.total).toBe(65);
  });

  it("하루 상한을 넘긴 활동은 점수를 받지 못한다(도배 방지)", () => {
    const s = scoreActivities(many("comment", 40, day(3)));
    expect(s.byType.comment.count).toBe(40);
    expect(s.byType.comment.counted).toBe(POINT_RULES.comment.dailyLimit);
    expect(s.total).toBe(POINT_RULES.comment.dailyLimit! * POINT_RULES.comment.points);
  });

  it("상한은 한국 시간 날짜마다 새로 센다", () => {
    const s = scoreActivities([...many("review", 3, day(3, 23)), ...many("review", 3, day(4, 1))]);
    expect(s.byType.review.counted).toBe(6);
    expect(s.total).toBe(60);
  });

  it("제보 승인에는 하루 상한이 없다", () => {
    expect(scoreActivities(many("tip_approved", 10, day(5))).total).toBe(500);
  });

  it("관리자 삭제는 감점이지만 총점이 0 아래로 내려가지는 않는다", () => {
    expect(scoreActivities([{ type: "tip_approved", at: day(1) }, { type: "admin_deleted", at: day(2) }]).total).toBe(30);
    expect(scoreActivities(many("admin_deleted", 5, day(2))).total).toBe(0);
  });

  it("사진 후기는 3건이 지도 기여 1회다(하루 상한 안에서 인정된 것만)", () => {
    // 사흘에 걸쳐 사진 후기 7건(하루 3·3·1) → 인정 7건 → 기여 2회
    const spread = [...many("review_photo", 3, day(1)), ...many("review_photo", 3, day(2)), ...many("review_photo", 1, day(3))];
    expect(scoreActivities(spread).mapContributions).toBe(2);
    // 하루에 30건을 몰아 써도 그날 인정되는 것은 3건 → 기여 1회
    expect(scoreActivities(many("review_photo", 30, day(4))).mapContributions).toBe(1);
    // 사진 없는 후기는 기여로 세지 않는다
    expect(scoreActivities(many("review", 3, day(5))).mapContributions).toBe(0);
  });

  it("지도 기여 횟수를 함께 센다(제보·정보 추가 승인 + 받아들여진 신고)", () => {
    const s = scoreActivities([{ type: "tip_approved", at: day(1) }, { type: "info_update_approved", at: day(1) }, { type: "report_accepted", at: day(2) }, { type: "review", at: day(2) }]);
    expect(s.mapContributions).toBe(3);
    expect(s.total).toBe(50 + 20 + 15 + 10);
  });

  it("꾸준한 기여자는 한 달쯤이면 4단계(산책대장)에 닿는다 — 주 1회 제보 승인 + 주 3회 사진 후기", () => {
    const month: Activity[] = [];
    const visitTimes: string[] = [];
    for (let week = 0; week < 4; week++) {
      month.push({ type: "tip_approved", at: day(1 + week * 7) });
      visitTimes.push(day(1 + week * 7));
      for (let k = 0; k < 3; k++) {
        month.push({ type: "review", at: day(2 + week * 7 + k) }, { type: "review_photo", at: day(2 + week * 7 + k) });
        visitTimes.push(day(2 + week * 7 + k));
      }
    }
    const s = scoreActivities(month);
    const p = updateLevel(null, { points: s.total, mapContributions: s.mapContributions, visits: visitsByMonth(visitTimes), now: day(28, 20) });
    expect(p.current.name).toBe("산책대장");
    expect(p.visitsThisMonth).toBe(16);
  });
});
