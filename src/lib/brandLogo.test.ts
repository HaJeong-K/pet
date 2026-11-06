import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { LOGO_SRC } from "@/components/brand/BrandLogo";

// ── 로고 고정 지킴이 ──
// 모든 화면의 로고는 src/components/brand/BrandLogo.tsx 하나로 그립니다(핀 그림 + 구기 글꼴 글자를 한 장으로 합친 그림).
// 화면 코드가 그림 주소를 직접 쓰거나 글자로 "펫츠로드" 로고를 따로 만들면 화면마다 로고가 달라져서, 이 검사가 막습니다.

const SRC = join(process.cwd(), "src");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}
const all = files(SRC).map((path) => ({ path: path.slice(SRC.length + 1).split("\\").join("/"), text: readFileSync(path, "utf8") }));

describe("로고 고정", () => {
  it("로고 그림 파일이 있다", () => {
    expect(existsSync(join(process.cwd(), "public", LOGO_SRC))).toBe(true);
  });
  it("로고 그림 주소는 BrandLogo에서만 쓴다", () => {
    const offenders = all.filter((f) => f.path !== "components/brand/BrandLogo.tsx" && /petsroad_(lockup|logo)\w*\.png/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
