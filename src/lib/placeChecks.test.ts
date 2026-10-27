import { describe, it, expect } from "vitest";
import { dataSourceOf, freshnessOf, relativeDay, summarizeChecks, type CheckRow } from "./placeChecks";

const now = new Date("2026-10-22T03:00:00Z").getTime();
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

describe("방문자 확인 요약", () => {
  it("최근 3개월 안의 확인만 세고, 달라졌어요는 내용별로 센다", () => {
    const rows: CheckRow[] = [
      { verdict: "ok", detail: null, created_at: ago(3) },
      { verdict: "ok", detail: null, created_at: ago(40) },
      { verdict: "ok", detail: null, created_at: ago(120) },
      { verdict: "changed", detail: "info", created_at: ago(10) },
    ];
    const s = summarizeChecks(rows, now);
    expect(s.okCount).toBe(2);
    expect(s.changedCount).toBe(1);
    expect(s.lastOkAt).toBe(ago(3));
    expect(s.changed).toEqual([{ detail: "info", count: 1, lastAt: ago(10) }]);
    expect(s.warn).toBe(false);
  });
  it("달라졌어요가 2건 이상이고 맞아요보다 많으면 경고한다", () => {
    const s = summarizeChecks([
      { verdict: "changed", detail: "no_pets", created_at: ago(2) },
      { verdict: "changed", detail: "no_pets", created_at: ago(5) },
      { verdict: "ok", detail: null, created_at: ago(30) },
    ], now);
    expect(s.warn).toBe(true);
    expect(s.changed[0]).toMatchObject({ detail: "no_pets", count: 2 });
  });
  it("그 뒤에 누군가 맞아요를 누르면 경고를 거둔다", () => {
    const s = summarizeChecks([
      { verdict: "changed", detail: "closed", created_at: ago(9) },
      { verdict: "changed", detail: "closed", created_at: ago(8) },
      { verdict: "ok", detail: null, created_at: ago(1) },
    ], now);
    expect(s.warn).toBe(false);
  });
});

describe("마지막 확인(신선도)", () => {
  it("방문자·사장님·공공데이터 중 가장 최근 것을 고른다", () => {
    expect(freshnessOf({ lastOkAt: ago(40), ownerVerifiedAt: ago(5), dataSyncedAt: ago(1) }, now)).toEqual({ at: ago(1), by: "data", tone: "fresh" });
    expect(freshnessOf({ lastOkAt: ago(2), ownerVerifiedAt: ago(5) }, now)).toMatchObject({ by: "visitor", tone: "fresh" });
  });
  it("같은 날이면 사람이 직접 확인한 것을 앞에 둔다", () => {
    expect(freshnessOf({ lastOkAt: ago(1), dataSyncedAt: ago(1) }, now).by).toBe("visitor");
  });
  it("30일 안이면 최근, 180일 안이면 보통, 그보다 오래됐거나 기록이 없으면 오래됨", () => {
    expect(freshnessOf({ ownerVerifiedAt: ago(100) }, now).tone).toBe("normal");
    expect(freshnessOf({ ownerVerifiedAt: ago(200) }, now).tone).toBe("stale");
    expect(freshnessOf({}, now)).toEqual({ at: null, by: null, tone: "stale" });
  });
});

describe("표시 문구", () => {
  it("며칠 전인지 사람이 읽기 쉽게", () => {
    expect(relativeDay(ago(0), now)).toBe("오늘");
    expect(relativeDay(ago(1), now)).toBe("어제");
    expect(relativeDay(ago(5), now)).toBe("5일 전");
    expect(relativeDay(ago(21), now)).toBe("3주 전");
    expect(relativeDay(ago(90), now)).toBe("3개월 전");
  });
  it("장소 번호로 공공데이터 출처를 안다", () => {
    expect(dataSourceOf(1)).toBe(null);
    expect(dataSourceOf(1_327_587_824)).toBe("한국관광공사");
    expect(dataSourceOf(3_100_000_000)).toBe("한국문화정보원");
    expect(dataSourceOf(9_000_000_123)).toBe("전국도시공원정보표준데이터");
  });
});
