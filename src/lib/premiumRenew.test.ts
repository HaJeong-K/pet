import { describe, expect, it } from "vitest";
import { renewAction, shouldPromptRenew } from "./premiumRenew";

const now = Date.parse("2026-10-29T03:00:00Z");
const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString();

describe("요금제 자동 연장", () => {
  it("만료 14일 안이고 아직 안 정했을 때만 팝업", () => {
    expect(shouldPromptRenew(inDays(10), null, now)).toBe(true);
    expect(shouldPromptRenew(inDays(20), null, now)).toBe(false);
    expect(shouldPromptRenew(inDays(10), true, now)).toBe(false);
    expect(shouldPromptRenew(inDays(10), false, now)).toBe(false);
    expect(shouldPromptRenew(inDays(-1), null, now)).toBe(false);
  });
  it("자동 연장이면 만료 3일 전에 한 번만 신청", () => {
    const exp = inDays(2);
    expect(renewAction(exp, { place_id: 1, enabled: true, reminded_for: null, renewed_for: null }, now)).toBe("file");
    expect(renewAction(exp, { place_id: 1, enabled: true, reminded_for: null, renewed_for: exp.slice(0, 10) }, now)).toBeNull();
    expect(renewAction(inDays(5), { place_id: 1, enabled: true, reminded_for: null, renewed_for: null }, now)).toBeNull();
    expect(renewAction(exp, { place_id: 1, enabled: false, reminded_for: null, renewed_for: null }, now)).toBeNull();
  });
  it("안 정했으면 만료 7일 전에 한 번 묻기", () => {
    const exp = inDays(6);
    expect(renewAction(exp, null, now)).toBe("remind");
    expect(renewAction(exp, { place_id: 1, enabled: null, reminded_for: exp.slice(0, 10), renewed_for: null }, now)).toBeNull();
    expect(renewAction(inDays(9), null, now)).toBeNull();
  });
});
