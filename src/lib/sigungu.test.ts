import { describe, it, expect } from "vitest";
import { normalizeSigungu, pickNearbyNotices, sigunguCentroid } from "./sigungu";

const n = (sub: string, id: string, region = "경북") => ({ region, subRegion: sub, id });
const make = (sub: string, count: number, region = "경북") => Array.from({ length: count }, (_, i) => n(sub, `${sub}${i}`, region));

describe("시·군·구 위치 기반 공고", () => {
  it("카카오 행정구역 이름과 공고번호 지역 표기를 같은 모양으로 맞춘다", () => {
    expect(normalizeSigungu("포항시 남구")).toBe("포항");
    expect(normalizeSigungu("해운대구")).toBe("해운대");
    expect(normalizeSigungu("달성군")).toBe("달성");
    expect(normalizeSigungu("창원1")).toBe("창원");
    expect(normalizeSigungu("남구")).toBe("남구");
    expect(normalizeSigungu("경주")).toBe("경주");
    expect(normalizeSigungu(null)).toBe("");
  });

  it("주요 시·군·구의 중심 좌표를 알고 있다", () => {
    expect(sigunguCentroid("경북", "포항시 남구")).not.toBeNull();
    expect(sigunguCentroid("부산", "해운대구")).not.toBeNull();
    expect(sigunguCentroid("경북", "없는곳")).toBeNull();
  });

  it("내 지역 공고가 4건 이상이면 내 지역만 보여준다", () => {
    const r = pickNearbyNotices([...make("경주", 6), ...make("포항", 5)], { sido: "경북", sigungu: "포항시 남구" });
    expect(r.subs).toEqual(["포항"]);
    expect(r.notices).toHaveLength(5);
    expect(r.ownCount).toBe(5);
  });

  it("내 지역 공고가 4건 미만이면 가장 가까운 지역부터 더한다", () => {
    // 포항 기준: 경주(약 25km) < 영덕(약 45km) < 안동(약 90km)
    const r = pickNearbyNotices([...make("안동", 5), ...make("영덕", 1), ...make("포항", 2), ...make("경주", 3)], { sido: "경북", sigungu: "포항시 북구" });
    expect(r.subs).toEqual(["포항", "경주"]);
    expect(r.notices.map((x) => x.subRegion)).toEqual(["포항", "포항", "경주", "경주", "경주"]);
  });

  it("내 지역에 공고가 없으면 가까운 지역 공고로 채운다", () => {
    const r = pickNearbyNotices([...make("안동", 5), ...make("경주", 2), ...make("영덕", 1)], { sido: "경북", sigungu: "포항시 남구" });
    expect(r.ownCount).toBe(0);
    expect(r.subs.slice(0, 2)).toEqual(["경주", "영덕"]);
    expect(r.notices.length).toBeGreaterThanOrEqual(4);
  });

  it("시·군·구 이름을 몰라도 좌표로 가까운 순서를 정한다", () => {
    const r = pickNearbyNotices([...make("안동", 5), ...make("경주", 2)], { sido: "경북", lat: 35.85, lng: 129.22 });
    expect(r.subs[0]).toBe("경주");
  });

  it("시·도 전체 공고가 4건이 안 되면 있는 만큼만 보여준다", () => {
    const r = pickNearbyNotices([...make("경주", 1), ...make("안동", 1)], { sido: "경북", sigungu: "포항시" });
    expect(r.notices).toHaveLength(2);
  });
});
