import { describe, expect, it } from "vitest";
import { formatPhone, isValidName, isValidPhone, normalizeName, normalizePhone } from "./contact";

describe("아이디 찾기용 이름·휴대폰 번호", () => {
  it("번호는 숫자만 남기고 휴대폰 모양만 받는다", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(isValidPhone("010-1234-5678")).toBe(true);
    expect(isValidPhone("011 123 4567")).toBe(true);
    expect(isValidPhone("02-123-4567")).toBe(false);
    expect(isValidPhone("010-123")).toBe(false);
  });
  it("입력하면서 하이픈을 넣어 보여 준다", () => {
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("0101234")).toBe("010-1234");
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("0111234567")).toBe("011-123-4567");
  });
  it("이름은 공백을 정리하고 두 글자 이상", () => {
    expect(normalizeName("  홍   길동 ")).toBe("홍 길동");
    expect(isValidName("홍")).toBe(false);
    expect(isValidName("홍길동")).toBe(true);
  });
});
