import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("로그의 인증키 가리기", () => {
  it("오류 메시지 안의 키를 모두 가린다", () => {
    const text = redactSecrets(new Error("fetch https://a.kr/x?serviceKey=AB%2Bcd%3D%3D&pageNo=1 and ?ServiceKey=zz /page"));
    expect(text).toBe("fetch https://a.kr/x?serviceKey=***&pageNo=1 and ?ServiceKey=*** /page");
  });
  it("키가 없으면 그대로 둔다", () => {
    expect(redactSecrets("목록 실패")).toBe("목록 실패");
    expect(redactSecrets(404)).toBe("404");
  });
});
