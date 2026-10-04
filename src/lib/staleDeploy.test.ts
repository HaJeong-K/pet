import { describe, it, expect } from "vitest";
import { isStaleDeployError } from "./staleDeploy";

describe("배포 직후 파일 누락 오류 판별", () => {
  it("예전 버전 화면이 사라진 파일을 불러오다 난 오류를 알아본다", () => {
    expect(isStaleDeployError({ name: "ChunkLoadError", message: "Failed to load chunk /_next/static/chunks/0lcrfsb4f0x7z.js from module 64893" })).toBe(true);
    expect(isStaleDeployError({ name: "Error", message: "Loading chunk 123 failed." })).toBe(true);
    expect(isStaleDeployError({ name: "TypeError", message: "Failed to fetch dynamically imported module: https://x/y.js" })).toBe(true);
  });
  it("일반 오류는 새로고침 대상이 아니다", () => {
    expect(isStaleDeployError({ name: "TypeError", message: "Cannot read properties of undefined" })).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});
