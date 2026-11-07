import { describe, expect, it } from "vitest";
import { checkCommentPassword, hashCommentPassword, isHashed } from "./commentPassword";

describe("비회원 후기 비밀번호", () => {
  it("암호화해 저장하고 같은 비밀번호만 통과한다", () => {
    const stored = hashCommentPassword("1234");
    expect(isHashed(stored)).toBe(true);
    expect(stored).not.toContain("1234");
    expect(checkCommentPassword("1234", stored)).toBe(true);
    expect(checkCommentPassword("1235", stored)).toBe(false);
  });
  it("예전 그대로 저장된 비밀번호도 맞춰 본다", () => {
    expect(checkCommentPassword("abcd", "abcd")).toBe(true);
    expect(checkCommentPassword("abce", "abcd")).toBe(false);
    expect(checkCommentPassword("abcd", null)).toBe(false);
  });
});
