import { describe, it, expect } from "vitest";
import { campaignLink, channelFromReferrer, nextFirstTouch, touchFrom } from "./trafficSource";
import { buildTrafficReport } from "./trafficReport";

const now = new Date("2026-10-22T03:00:00Z").getTime();

describe("유입 채널 알아내기", () => {
  it("홍보 링크의 꼬리표가 있으면 그것을 쓴다", () => {
    expect(touchFrom("?utm_source=naver_blog&utm_campaign=Launch Event", "https://www.google.com/", "gachigagae.vercel.app", now)).toEqual({ src: "naver_blog", cmp: "launchevent", at: now });
  });
  it("꼬리표가 없으면 직전 사이트로 알아낸다", () => {
    expect(channelFromReferrer("https://m.blog.naver.com/abc/123")).toBe("naver_blog");
    expect(channelFromReferrer("https://m.search.naver.com/search.naver?query=x")).toBe("naver");
    expect(channelFromReferrer("https://l.instagram.com/?u=x")).toBe("instagram");
    expect(channelFromReferrer("https://www.threads.net/@a")).toBe("threads");
    expect(channelFromReferrer("https://www.youtube.com/shorts/x")).toBe("youtube");
    expect(channelFromReferrer("https://www.google.co.kr/")).toBe("google");
    expect(channelFromReferrer("https://example.com/")).toBe("other");
  });
  it("직전 사이트가 없거나 우리 사이트면 직접 방문", () => {
    expect(channelFromReferrer("")).toBe("direct");
    expect(channelFromReferrer("https://gachigagae.vercel.app/community", "gachigagae.vercel.app")).toBe("direct");
  });
  it("첫 유입은 90일 유지하되, 직접 방문뿐이었다면 새로 알게 된 채널로 바꾼다", () => {
    const blog = { src: "naver_blog", cmp: null, at: now - 10 * 86_400_000 };
    expect(nextFirstTouch(blog, { src: "instagram", cmp: null, at: now }, now)).toBe(blog);
    expect(nextFirstTouch({ ...blog, src: "direct" }, { src: "instagram", cmp: null, at: now }, now).src).toBe("instagram");
    expect(nextFirstTouch({ ...blog, at: now - 100 * 86_400_000 }, { src: "instagram", cmp: null, at: now }, now).src).toBe("instagram");
  });
  it("홍보 링크를 만든다", () => {
    expect(campaignLink("https://gachigagae.vercel.app", "instagram", "dog_cafe")).toBe("https://gachigagae.vercel.app/?utm_source=instagram&utm_campaign=dog_cafe");
  });
});

describe("채널별 성과", () => {
  const since = "2026-09-22T00:00:00Z";
  const views = [
    { user_key: "a", auth_user_id: null, created_at: "2026-10-01T01:00:00Z", meta: { src: "naver_blog", fsrc: "naver_blog" } },
    { user_key: "a", auth_user_id: "u1", created_at: "2026-10-05T01:00:00Z", meta: { src: "direct", fsrc: "naver_blog" } },
    { user_key: "b", auth_user_id: null, created_at: "2026-10-02T01:00:00Z", meta: { src: "instagram", fsrc: "instagram" } },
    { user_key: "c", auth_user_id: null, created_at: "2026-10-03T01:00:00Z", meta: null },
  ];
  it("첫 유입 채널별로 방문자·재방문·회원·신규 가입을 센다(기록 전 방문은 빼고)", () => {
    const r = buildTrafficReport(views, [{ user_key: "a", created_at: "2026-10-05T01:00:00Z" }], since);
    expect(r.trackedVisitors).toBe(2);
    expect(r.channels).toEqual([
      { channel: "naver_blog", visitors: 1, returning: 1, members: 1, signups: 1 },
      { channel: "instagram", visitors: 1, returning: 0, members: 0, signups: 0 },
    ]);
  });
});
