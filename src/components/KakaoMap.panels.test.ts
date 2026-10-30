import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 산책 코스·취향 추천 패널 코드가 통째로 지워진 적이 있어, 패널이 화면에 그려지는지 코드에서 확인합니다.
const source = readFileSync(join(__dirname, "KakaoMap.tsx"), "utf8");

describe("지도 패널", () => {
  it.each(["{showRecentPanel && (", "{showRecommendPanel && (", "{showRoutePanel && ("])("%s 패널이 있다", (open) => {
    expect(source).toContain(open);
  });
  it("취향 추천은 추천 목록을 보여 준다", () => {
    expect(source).toContain("recommendedPlaces.map(");
  });
  it("산책 코스는 정거장·테마·다른 코스·고정 기능이 있다", () => {
    for (const code of ["displayRoute?.stops.map(", "setRouteTheme(theme)", "setRouteExcludedIds((prev)", "setPinnedStopIds("]) expect(source).toContain(code);
  });
});
