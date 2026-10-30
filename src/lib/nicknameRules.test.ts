import { describe, expect, it } from "vitest";
import { isReservedNickname } from "./nicknameRules";

describe("닉네임 금지어", () => {
  it("사장님·운영진 사칭을 막는다", () => {
    expect(isReservedNickname("[대구]가게_사장님")).toBe(true);
    expect(isReservedNickname("사 장 님")).toBe(true);
    expect(isReservedNickname("같이가개 운영진")).toBe(true);
    expect(isReservedNickname("관리자1")).toBe(true);
  });
  it("보통 닉네임은 쓸 수 있다", () => {
    expect(isReservedNickname("슈나우저맘")).toBe(false);
    expect(isReservedNickname("사장")).toBe(false);
  });
});
