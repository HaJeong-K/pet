import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── 하단 탭바 가림 방지 규칙 지킴이 ──
// 폰에서 페이지를 끝까지 내려도 마지막 내용이 하단 탭바에 가려지던 문제를 여러 번 고쳤는데,
// 화면을 손볼 때마다 다시 생겼습니다. 아래 규칙이 깨지면 테스트가 실패해서 바로 알 수 있습니다.
//   1) 탭바가 가리는 높이는 숫자로 적지 않고 --ggk-tabbar-space(TabBar가 기기에서 직접 잰 값)를 씁니다.
//   2) 화면 높이는 100vh가 아니라 100dvh를 씁니다(폰 주소창 높이만큼 아래가 잘리지 않게).
//   3) 세로 스크롤 칸을 가로 flex로 만들지 않습니다(안쪽 상자가 늘어나지 못해 아래 여백이 무시됩니다).

const SRC = join(process.cwd(), "src");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(path);
  }
  return out;
}
const rel = (path: string) => path.slice(SRC.length + 1).replace(/\\/g, "/");
const all = files(SRC).map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }));

// 탭바가 떠 있는 채로 세로로 길게 스크롤되는 화면들 — 새 화면을 만들면 여기에 추가하세요.
const PAGES_UNDER_TABBAR = [
  "app/admin/page.tsx", "app/admin/reports/page.tsx", "app/admin/tips/page.tsx", "app/admin/review/page.tsx",
  "app/admin/owners/page.tsx", "app/admin/premium/page.tsx", "app/admin/analytics/page.tsx", "app/admin/kpi/page.tsx",
  "app/admin/quality/page.tsx", "app/admin/errors/page.tsx", "app/admin/members/page.tsx",
  "app/owner/page.tsx", "app/shelter-notices/ShelterNoticesClient.tsx",
];

describe("하단 탭바 가림 방지", () => {
  it("탭바 높이를 재서 넣는 코드와 기본값이 있다", () => {
    expect(readFileSync(join(SRC, "app/globals.css"), "utf8")).toContain("--ggk-tabbar-space");
    expect(readFileSync(join(SRC, "components/TabBar.tsx"), "utf8")).toContain('setProperty("--ggk-tabbar-space"');
  });

  it.each(PAGES_UNDER_TABBAR)("%s 는 아래 여백에 --ggk-tabbar-space를 쓴다", (page) => {
    const file = all.find((f) => f.path === page);
    expect(file, `${page} 파일이 없어요`).toBeTruthy();
    expect(file!.text).toMatch(/--ggk-tabbar-space|ggk-tabbar-pad/);
  });

  it("관리자 화면은 새로 생겨도 모두 목록에 들어 있다", () => {
    const adminPages = all.filter((f) => /^app\/admin\/.*page\.tsx$/.test(f.path)).map((f) => f.path);
    expect(adminPages.filter((p) => !PAGES_UNDER_TABBAR.includes(p))).toEqual([]);
  });

  it("화면 높이에 100vh를 쓰지 않는다(100dvh 사용)", () => {
    // SideAdRail은 PC 전용 옆 광고 칸이라 예외(폰 주소창 문제가 없음).
    const offenders = all
      .filter((f) => f.path !== "components/SideAdRail.tsx")
      .filter((f) => /["'`]100vh["'`]/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("세로 스크롤 칸을 가로 flex로 만들지 않는다", () => {
    const offenders: string[] = [];
    for (const f of all) {
      f.text.split("\n").forEach((line, i) => {
        if (!/overflowY:\s*["'](auto|scroll)["']/.test(line) || !/display:\s*["']flex["']/.test(line)) return;
        // 세로 flex이거나 위쪽 정렬(늘어나지 않음)이면 괜찮습니다.
        if (/flexDirection:\s*["']column["']/.test(line) || /alignItems:\s*["']flex-start["']/.test(line)) return;
        offenders.push(`${f.path}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
