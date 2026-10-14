import { describe, it, expect } from "vitest";
import { BANNER_CHANGE_DAYS, BANNER_FONTS, BANNER_HEADLINE_MAX, bannerAddress, bannerFont, bannerFontsUrl, changeAllowance, cleanBannerCreative } from "./bannerCreative";
import { ADJACENT_KM, chooseBannerPool, type BannerPerk, type GeoAdPlace } from "./localAds";
import { addInterest, type InterestPoint } from "./interestRegions";
import { cleanInquiry } from "./partnerInquiry";

const day = 86_400_000;
const now = new Date("2026-10-14T00:00:00Z").getTime();

describe("배너 내용", () => {
  it("문구를 다듬어 받는다", () => {
    expect(cleanBannerCreative({ headline: "  댕댕이랑   브런치 ", body: " ", imageUrl: "", font: "pen" })).toEqual({ creative: { headline: "댕댕이랑 브런치", body: null, imageUrl: null, font: "pen" } });
  });
  it("빈 문구·너무 긴 문구·모르는 글꼴·이상한 사진 주소는 거절한다", () => {
    expect(cleanBannerCreative({ headline: "", font: "gothic" })).toHaveProperty("error");
    expect(cleanBannerCreative({ headline: "가".repeat(BANNER_HEADLINE_MAX + 1), font: "gothic" })).toHaveProperty("error");
    expect(cleanBannerCreative({ headline: "안녕", font: "comic-sans" })).toHaveProperty("error");
    expect(cleanBannerCreative({ headline: "안녕", font: "gothic", imageUrl: "javascript:alert(1)" })).toHaveProperty("error");
    expect(cleanBannerCreative({ headline: "안녕", font: "gothic", imageUrl: "https://x.test/a.jpg\") no-repeat" })).toHaveProperty("error");
  });
  it("글꼴은 궁서체·여러 고딕·손글씨·로고체를 고를 수 있다", () => {
    const ids = BANNER_FONTS.map((f) => f.id);
    for (const id of ["logo", "gothic", "gothic-bold", "serious", "pen"]) expect(ids).toContain(id);
    expect(bannerFont("없는글꼴").id).toBe("gothic");
    expect(bannerFontsUrl(["gothic", "logo"])).toBe(null);
    expect(bannerFontsUrl(["pen", "pen", "round"])).toBe("https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Jua&display=swap");
  });
});

describe("배너에 적는 주소", () => {
  it("시·도는 빼고 짧게 적는다", () => {
    expect(bannerAddress("대구광역시 달서구 공원순환로 36")).toBe("달서구 공원순환로 36");
    expect(bannerAddress("경북 포항시 남구 대잠동 1 (대잠동)")).toBe("포항시 남구 대잠동 1");
    expect(bannerAddress("세종시 한누리대로")).toBe("세종시 한누리대로");
    expect(bannerAddress("")).toBe(null);
  });
});

describe("배너는 2주에 한 번만 바꿀 수 있다", () => {
  it("처음 만들 때는 언제든", () => {
    expect(changeAllowance(null, 0, now).allowed).toBe(true);
  });
  it("바꾼 지 2주가 안 됐으면 막고, 며칠 남았는지 알려 준다", () => {
    const result = changeAllowance(new Date(now - 4 * day).toISOString(), 0, now);
    expect(result.allowed).toBe(false);
    expect(result.daysLeft).toBe(BANNER_CHANGE_DAYS - 4);
  });
  it("2주가 지나면 다시 바꿀 수 있다", () => {
    expect(changeAllowance(new Date(now - BANNER_CHANGE_DAYS * day).toISOString(), 0, now)).toMatchObject({ allowed: true, usesExtra: false });
  });
  it("관리자가 한도를 풀어 주면 2주 전이라도 한 번 바꿀 수 있고, 그 횟수를 쓴다", () => {
    expect(changeAllowance(new Date(now - 2 * day).toISOString(), 1, now)).toMatchObject({ allowed: true, usesExtra: true });
  });
  it("2주가 지난 뒤에는 풀어 준 횟수를 쓰지 않는다", () => {
    expect(changeAllowance(new Date(now - 20 * day).toISOString(), 1, now)).toMatchObject({ allowed: true, usesExtra: false });
  });
});

describe("누구에게 어느 가게의 배너를 보여 줄지", () => {
  const place = (over: Partial<GeoAdPlace>): GeoAdPlace => ({ id: 1, name: "가게", category: null, image_url: null, address: "대구 달서구 1", lat: 35.85, lng: 128.56, is_premium: true, premium_expires_at: "2099-01-01", premium_plan: "local", ...over });
  const none = new Map<number, BannerPerk>();
  const daegu = place({ id: 1 });
  const daegu2 = place({ id: 2 });
  const gyeongsan = place({ id: 3, address: "경북 경산시 1", lat: 35.82, lng: 128.74 });   // 달서구에서 약 16km
  const jeju = place({ id: 4, address: "제주 제주시 1", lat: 33.5, lng: 126.53 });
  const jejuPremiumOnly = place({ id: 5, address: "제주 서귀포시 1", lat: 33.45, lng: 126.56, premium_plan: "premium" });

  it("내 동네에 배너 가게가 있으면 그 가게들만", () => {
    const { tier, pool } = chooseBannerPool([daegu, daegu2, gyeongsan, jeju], none, { sigungu: "달서구", lat: 35.85, lng: 128.56 }, now);
    expect(tier).toBe("local");
    expect(pool.map((p) => p.id)).toEqual([1, 2]);
  });
  it("내 동네에 없으면 바로 근처 지역의 배너 가게", () => {
    const { tier, pool } = chooseBannerPool([gyeongsan, jeju], none, { sigungu: "달서구", lat: 35.85, lng: 128.56 }, now);
    expect(tier).toBe("adjacent");
    expect(pool.map((p) => p.id)).toEqual([3]);
    expect(ADJACENT_KM).toBeGreaterThan(16);
  });
  it("근처에도 없으면 최근에 찾아본 지역 근처의 배너 가게", () => {
    const { tier, pool } = chooseBannerPool([jeju, jejuPremiumOnly], none, { sigungu: "달서구", lat: 35.85, lng: 128.56, interests: [{ lat: 33.49, lng: 126.5 }] }, now);
    expect(tier).toBe("interest");
    expect(pool.map((p) => p.id)).toEqual([4]);
  });
  it("찾아본 지역에 배너 가게가 없으면 그 근처의 프리미엄 가게", () => {
    const seoul = place({ id: 9, address: "서울 강남구 1", lat: 37.5, lng: 127.03 });
    const { tier, pool } = chooseBannerPool([seoul, jejuPremiumOnly], none, { sigungu: "달서구", lat: 35.85, lng: 128.56, interests: [{ lat: 33.46, lng: 126.56 }] }, now);
    expect(tier).toBe("interest-premium");
    expect(pool.map((p) => p.id)).toEqual([5]);
  });
  it("아무 관련이 없으면 전국의 배너 가게 중에서(무작위로 고를 후보)", () => {
    const { tier, pool } = chooseBannerPool([jeju, jejuPremiumOnly], none, { sigungu: "달서구", lat: 35.85, lng: 128.56 }, now);
    expect(tier).toBe("random");
    expect(pool.map((p) => p.id)).toEqual([4]);
  });
  it("위치를 몰라도 관심 지역이나 무작위로 보여 준다", () => {
    expect(chooseBannerPool([jeju], none, {}, now).tier).toBe("random");
    expect(chooseBannerPool([], none, {}, now)).toEqual({ tier: "none", pool: [] });
  });
});

describe("관심 지역 기억", () => {
  it("가까운 곳은 하나로 합치고, 새것을 앞에 둔다", () => {
    let list: InterestPoint[] = [];
    list = addInterest(list, { lat: 33.5, lng: 126.53, source: "search" }, now);
    list = addInterest(list, { lat: 37.5, lng: 127.03, source: "place" }, now + 1);
    list = addInterest(list, { lat: 33.51, lng: 126.54, source: "place" }, now + 2);
    expect(list.map((p) => p.lat)).toEqual([33.51, 37.5]);
  });
  it("30일이 지난 것은 버리고 8곳까지만 둔다", () => {
    let list: InterestPoint[] = [{ lat: 38.12, lng: 128, at: now - 31 * day, source: "search" }];
    for (let i = 0; i < 10; i++) list = addInterest(list, { lat: 33 + i * 0.5, lng: 126, source: "search" }, now + i);
    expect(list.length).toBe(8);
    expect(list.some((p) => p.lat === 38.12)).toBe(false);
  });
});

describe("광고·제휴 문의", () => {
  const ok = { kind: "ad", name: "홍길동", company: "멍멍상사", contact: "hong@example.com", message: "지역 배너 광고 요금이 궁금합니다." };
  it("이메일이나 전화번호로 연락처를 받는다", () => {
    expect(cleanInquiry(ok)).toHaveProperty("inquiry");
    expect(cleanInquiry({ ...ok, contact: "010-1234-5678" })).toHaveProperty("inquiry");
    expect(cleanInquiry({ ...ok, contact: "연락주세요" })).toHaveProperty("error");
  });
  it("종류·이름·내용이 빠지면 거절한다", () => {
    expect(cleanInquiry({ ...ok, kind: "spam" })).toHaveProperty("error");
    expect(cleanInquiry({ ...ok, name: " " })).toHaveProperty("error");
    expect(cleanInquiry({ ...ok, message: "짧음" })).toHaveProperty("error");
  });
});
