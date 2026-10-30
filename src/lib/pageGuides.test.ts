import { beforeEach, describe, expect, it, vi } from "vitest";
import * as guides from "./pageGuides";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

describe("맞춤 화면 안내", () => {
  it("고른 목적이 없으면 장소 찾기 안내를 보여 준다", () => {
    expect(guides.getGuideInterest()).toBe("places");
    expect(guides.mapGuideSteps()[0].title).toBe("검색");
  });
  it.each([["stay", "숙소 탭"], ["shop", "쇼핑 탭"], ["owner", "사장님"]] as const)("%s를 고르면 %s부터 안내한다", (interest, title) => {
    guides.setGuideInterest(interest);
    expect(guides.getGuideInterest()).toBe(interest);
    expect(guides.mapGuideSteps()[0].title).toBe(title);
  });
  it("저장된 값이 이상하면 기본 안내로 돌아간다", () => {
    store.set("ggk_guide_interest", "x");
    expect(guides.getGuideInterest()).toBe("places");
  });
  it("안내마다 기억하는 이름이 다르다", () => {
    const keys = Object.entries(guides).filter(([name]) => name.endsWith("_GUIDE_KEY")).map(([, value]) => value as string);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("문구에 금지 표현이 없다", () => {
    const steps = Object.values(guides).flatMap((v) => (Array.isArray(v) ? v : []));
    for (const interest of ["places", "stay", "shop", "owner"] as const) {
      guides.setGuideInterest(interest);
      steps.push(...guides.mapGuideSteps());
    }
    expect(steps.filter((s) => /묵/.test(s.text))).toEqual([]);
  });
});
