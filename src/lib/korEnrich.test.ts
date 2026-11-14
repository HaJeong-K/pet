import { describe, expect, it } from "vitest";
import { applyKorFill, cleanKorText, korTypeFor, matchKorItem, tidyKorHours } from "./server/korEnrich";
import { cleanPhone } from "./permitMatch";

describe("관광공사 정보로 빈칸 채우기", () => {
  it("영업시간 글을 줄바꿈으로 다듬는다(시간 범위의 줄표는 그대로)", () => {
    expect(tidyKorHours("- 09:00~21:00- 마지막 주문 20:30")).toBe("09:00~21:00\n마지막 주문 20:30");
    expect(tidyKorHours("[평일] - 17:30~22:30 - 마지막 주문 21:30 [주말] - 12:00~22:00")).toBe("[평일] 17:30~22:30\n마지막 주문 21:30\n[주말] 12:00~22:00");
    expect(tidyKorHours("월~금 09:00 - 20:00")).toBe("월~금 09:00 - 20:00");
  });
  it("태그를 걷어 낸다", () => {
    expect(cleanKorText("11:00~20:00<br />(월요일 휴무)")).toBe("11:00~20:00\n(월요일 휴무)");
    expect(cleanKorText("")).toBeUndefined();
  });
  it("분류에 맞는 관광공사 유형", () => {
    expect(korTypeFor("일반음식점")).toBe(39);
    expect(korTypeFor("펜션")).toBe(32);
    expect(korTypeFor("동물병원")).toBeNull();
  });
  const item = (title: string, lat: number, lng: number) => ({ contentid: "1", contenttypeid: "39", title, mapy: String(lat), mapx: String(lng) });
  const grid = (items: ReturnType<typeof item>[]) => new Map([["3550:12860", items], ["3551:12860", []]]);
  it("가깝고 이름이 같은 가게만 맞춘다", () => {
    expect(matchKorItem({ name: "행복식당", lat: 35.5001, lng: 128.6001 }, grid([item("행복식당", 35.5003, 128.6002)]))?.title).toBe("행복식당");
    expect(matchKorItem({ name: "행복식당", lat: 35.5001, lng: 128.6001 }, grid([item("다른식당", 35.5001, 128.6001)]))).toBeNull();
    // 이름이 포함 관계뿐이면 150m 안에서만
    expect(matchKorItem({ name: "행복식당 본점", lat: 35.5001, lng: 128.6001 }, grid([item("행복식당", 35.5031, 128.6001)]))).toBeNull();
  });
  it("같은 이름 후보가 비슷한 거리에 둘이면 고르지 않는다", () => {
    expect(matchKorItem({ name: "행복식당", lat: 35.5001, lng: 128.6001 }, grid([item("행복식당", 35.5002, 128.6001), item("행복식당", 35.5003, 128.6001)]))).toBeNull();
  });
  it("비어 있는 칸만 채우고 원래 값은 바꾸지 않는다", () => {
    const list = [{ id: 1, name: "가", category: "일반음식점", address: "", lat: 1, lng: 1, hours: null, closed_days: "월요일", parking: null, phone: null, image_url: "/images/default-place.png", memo: "원래 메모" }];
    const [p] = applyKorFill(list, { "1": { h: "10:00~20:00", c: "연중무휴", p: "가능", t: "050713679954", i: "https://x/y.jpg", m: "돈가스", at: 1 } });
    expect(p.hours).toBe("10:00~20:00");
    expect(p.closed_days).toBe("월요일");
    expect(p.parking).toBe("가능");
    expect(p.phone).toBe("0507-1367-9954");
    expect(p.image_url).toBe("https://x/y.jpg");
    expect(p.memo).toContain("대표 메뉴: 돈가스");
  });
  it("안심번호(050X)는 네 자리 국번으로", () => {
    expect(cleanPhone("050-7136-79954")).toBe("0507-1367-9954");
    expect(cleanPhone("053-123-4567")).toBe("053-123-4567");
  });
});
