import { describe, it, expect } from "vitest";
import {
  buildCronDigest, countBySource, delta, diffTourList, isSuspiciousDrop, kakaoLength, kstDateLabel, namesText,
  KAKAO_MAX, type DigestInput, type TourEntry,
} from "./cronDigest";

const e = (id: string, name = `장소${id}`): TourEntry => ({ id, name });
const base: DigestInput = {
  dateLabel: "10/28(화)",
  failed: [],
  map: { now: { total: 33366, culture: 21114, tour: 9482, foodsafety: 2770 }, prev: { total: 33369, culture: 21114, tour: 9485, foodsafety: 2770 } },
  tourList: { total: 9655, prevTotal: 9658, added: [], removed: [e("1", "가나다펜션"), e("2", "마바사카페"), e("3", "아자차캠핑장")], suspicious: false },
  tourDetails: { fetched: 1, have: 9655, total: 9655 },
  backup: { sizeKb: 1234 },
  pending: [],
  errors24h: 0,
};

describe("관광공사 목록 비교", () => {
  it("빠진 곳과 새로 생긴 곳을 나눈다", () => {
    const { added, removed } = diffTourList([e("1"), e("2"), e("3")], [e("2"), e("3"), e("4")]);
    expect(removed.map((x) => x.id)).toEqual(["1"]);
    expect(added.map((x) => x.id)).toEqual(["4"]);
  });
  it("비었거나 10% 넘게 줄면 의심", () => {
    expect(isSuspiciousDrop(9658, 0)).toBe(true);
    expect(isSuspiciousDrop(9658, 8000)).toBe(true);
    expect(isSuspiciousDrop(9658, 9655)).toBe(false);
    expect(isSuspiciousDrop(0, 9658)).toBe(false);
  });
});

describe("숫자·이름 표시", () => {
  it("공공데이터별로 센다", () => {
    expect(countBySource([{ sourceId: "culture-1" }, { sourceId: "tour-2" }, { sourceId: "tour-3" }, { sourceId: "foodsafety-4" }, { sourceId: null }]))
      .toEqual({ total: 5, culture: 1, tour: 2, foodsafety: 1 });
  });
  it("어제와 차이는 변동이 있을 때만", () => {
    expect(delta(10, 10)).toBe("");
    expect(delta(13, 10)).toBe("(+3)");
    expect(delta(9655, 9658)).toBe("(-3)");
    expect(delta(5, null)).toBe("");
  });
  it("이름은 앞의 몇 곳만, 나머지는 외 n곳", () => {
    const list = [e("1", "가"), e("2", "나"), e("3", "다")];
    expect(namesText(list, 2)).toBe("가, 나 외 1곳");
    expect(namesText(list, 5)).toBe("가, 나, 다");
    expect(namesText(list, 0)).toBe("3곳");
  });
  it("한국 날짜", () => {
    expect(kstDateLabel(new Date("2026-10-27T18:00:00Z").getTime())).toBe("10/28(수)");
  });
});

describe("새벽 작업 알림", () => {
  it("빠진 곳 수·이름과 공공데이터별 수치를 담고 카카오톡 200자를 넘지 않는다", () => {
    const { title, kakaoLines, pushLines } = buildCronDigest(base);
    const text = kakaoLines.join("\n");
    expect(text).toContain("관광공사 목록 9,655곳(-3)");
    expect(text).toContain("빠짐 3: 가나다펜션, 마바사카페, 아자차캠핑장");
    expect(text).toContain("문화 21,114 · 관광 9,482(-3) · 음식 2,770");
    expect(text).toContain("관광 상세 +1 (9,655/9,655)");
    expect(kakaoLength(title, kakaoLines)).toBeLessThanOrEqual(KAKAO_MAX);
    expect(pushLines.join("\n")).toContain("아자차캠핑장");
  });

  it("너무 길면 카카오톡은 이름을 줄이고, 앱 알림에는 이름을 더 담는다", () => {
    const many = Array.from({ length: 12 }, (_, i) => e(String(i), `아주긴이름의반려동물동반펜션${i}`));
    const d: DigestInput = { ...base, tourList: { ...base.tourList!, removed: many, total: 9646 }, quality: { coords: 1, duplicate: 2, broken_image: 3, missing_info: 4 } };
    const { title, kakaoLines, pushLines } = buildCronDigest(d);
    expect(kakaoLength(title, kakaoLines)).toBeLessThanOrEqual(KAKAO_MAX);
    expect(kakaoLines.some((l) => l.startsWith("빠짐 12"))).toBe(true);
    expect(pushLines.join("\n")).toContain("아주긴이름의반려동물동반펜션11");
  });

  it("줄이 많은 날에는 백업 줄을 먼저 빼고 장소 이름은 남긴다", () => {
    const d: DigestInput = { ...base, quality: { coords: 0, duplicate: 3, broken_image: 1, missing_info: 12 }, pending: ["제보 2"], errors24h: 1 };
    const { title, kakaoLines } = buildCronDigest(d);
    expect(kakaoLength(title, kakaoLines)).toBeLessThanOrEqual(KAKAO_MAX);
    expect(kakaoLines.join("\n")).toContain("가나다펜션");
    expect(kakaoLines.some((l) => l.startsWith("DB 백업"))).toBe(false);
  });

  it("실패는 맨 앞에 두고 제목에 표시한다", () => {
    const { title, kakaoLines } = buildCronDigest({ ...base, failed: [{ name: "backup", error: "Gateway Timeout" }] });
    expect(title).toContain("일부 실패");
    expect(kakaoLines[0]).toBe("실패 backup: Gateway Timeout");
  });

  it("목록을 다 못 받은 날은 기준을 유지한다고 알린다", () => {
    const { kakaoLines } = buildCronDigest({ ...base, tourList: { total: 8000, prevTotal: 9658, added: [], removed: [], suspicious: true } });
    expect(kakaoLines[0]).toBe("관광공사 목록 이상 8,000곳(어제 9,658) — 기준 유지");
  });

  it("변동이 없으면 한 줄로", () => {
    const { kakaoLines } = buildCronDigest({ ...base, tourList: { total: 9658, prevTotal: 9658, added: [], removed: [], suspicious: false } });
    expect(kakaoLines).toContain("관광공사 목록 9,658곳 변동 없음");
  });
});
