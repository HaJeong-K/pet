import { describe, expect, it } from "vitest";
import { countsAsStrike, isBlocking, nextSanction } from "./sanctions";

describe("회원 제재 단계", () => {
  it("위반 횟수에 따라 경고 → 7일 → 30일 → 영구", () => {
    expect(nextSanction(0).label).toBe("경고");
    expect(nextSanction(1)).toMatchObject({ stage: "suspend", days: 7 });
    expect(nextSanction(2)).toMatchObject({ stage: "suspend", days: 30 });
    expect(nextSanction(3).stage).toBe("ban");
    expect(nextSanction(9).stage).toBe("ban");
  });
  it("중대한 위반은 바로 영구 정지", () => {
    expect(nextSanction(0, true).stage).toBe("ban");
  });
  const now = new Date("2026-11-13T00:00:00Z").getTime();
  it("해제됐거나 1년이 지난 기록은 위반으로 세지 않는다", () => {
    expect(countsAsStrike({ stage: "warning", ends_at: null, lifted_at: null, created_at: "2026-06-01T00:00:00Z" }, now)).toBe(true);
    expect(countsAsStrike({ stage: "warning", ends_at: null, lifted_at: "2026-06-02T00:00:00Z", created_at: "2026-06-01T00:00:00Z" }, now)).toBe(false);
    expect(countsAsStrike({ stage: "warning", ends_at: null, lifted_at: null, created_at: "2025-10-01T00:00:00Z" }, now)).toBe(false);
  });
  it("경고는 막지 않고, 기간이 남은 제한과 영구 정지만 막는다", () => {
    expect(isBlocking({ stage: "warning", ends_at: null, lifted_at: null, created_at: "2026-11-12T00:00:00Z" }, now)).toBe(false);
    expect(isBlocking({ stage: "suspend", ends_at: "2026-11-15T00:00:00Z", lifted_at: null, created_at: "2026-11-08T00:00:00Z" }, now)).toBe(true);
    expect(isBlocking({ stage: "suspend", ends_at: "2026-11-10T00:00:00Z", lifted_at: null, created_at: "2026-11-03T00:00:00Z" }, now)).toBe(false);
    expect(isBlocking({ stage: "ban", ends_at: null, lifted_at: null, created_at: "2025-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isBlocking({ stage: "ban", ends_at: null, lifted_at: "2026-01-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z" }, now)).toBe(false);
  });
});
