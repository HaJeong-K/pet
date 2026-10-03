import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
  process.env.KAKAO_REST_API_KEY = "test-rest-key";
});

describe("카카오톡 알림 연결 요청(state) 위조 방지", () => {
  it("서버가 서명한 state는 같은 관리자 ID로 확인된다", async () => {
    const { signState, verifyState } = await import("./kakaoTalk");
    expect(verifyState(signState("admin-123"))).toBe("admin-123");
  });

  it("관리자 ID를 바꾸거나 서명을 바꾸면 거절한다", async () => {
    const { signState, verifyState } = await import("./kakaoTalk");
    const [, ts, sig] = Buffer.from(signState("admin-123"), "base64url").toString("utf8").split(".");
    const tampered = Buffer.from(`attacker.${ts}.${sig}`).toString("base64url");
    expect(verifyState(tampered)).toBeNull();
    expect(verifyState("forged")).toBeNull();
  });

  it("10분이 지난 state는 거절한다", async () => {
    const { signState, verifyState } = await import("./kakaoTalk");
    const state = signState("admin-123");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(verifyState(state)).toBeNull();
    vi.useRealTimers();
  });

  it("동의 화면 주소에 메시지 전송 권한과 돌아올 주소가 들어간다", async () => {
    const { kakaoTalkAuthorizeUrl } = await import("./kakaoTalk");
    const url = new URL(kakaoTalkAuthorizeUrl("https://example.com", "s")!);
    expect(url.searchParams.get("scope")).toBe("talk_message");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/api/admin/kakao-talk/callback");
  });
});
