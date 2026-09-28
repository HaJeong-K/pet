import { describe, expect, it } from "vitest";
import { detectPlatform, kakaoWalkUrl, naverWalkIntentUrl, naverWalkSchemeUrl } from "./directions";

const A = { name: "내 위치", lat: 35.1798, lng: 129.075 };
const B = { name: "온천공원", lat: 35.2072, lng: 129.0617 };
const C = { name: "호맥 동래럭키점", lat: 35.2101, lng: 129.0741 };

describe("kakaoWalkUrl", () => {
  it("공식 /link/by/walk/ 형식으로 이름·좌표를 순서대로 잇는다", () => {
    expect(kakaoWalkUrl([A, B, C])).toBe(
      `https://map.kakao.com/link/by/walk/${encodeURIComponent("내 위치")},35.1798,129.075/` +
        `${encodeURIComponent("온천공원")},35.2072,129.0617/${encodeURIComponent("호맥 동래럭키점")},35.2101,129.0741`
    );
  });

  it("이름의 쉼표·슬래시는 구분자와 겹치지 않게 공백으로 바꾼다", () => {
    const url = kakaoWalkUrl([A, { ...B, name: "카페, 1/2층" }]);
    expect(decodeURIComponent(url)).toContain("/카페 1 2층,35.2072,129.0617");
  });

  it("경유지가 5곳을 넘으면 출발·도착은 유지하고 경유지를 5곳으로 줄인다", () => {
    const via = Array.from({ length: 7 }, (_, i) => ({ name: `v${i}`, lat: 35 + i / 100, lng: 129 }));
    const url = kakaoWalkUrl([A, ...via, C]);
    const segments = url.replace("https://map.kakao.com/link/by/walk/", "").split("/");
    expect(segments).toHaveLength(7);
    expect(decodeURIComponent(segments[6])).toContain("호맥 동래럭키점");
  });
});

describe("naver walk urls", () => {
  it("공백을 +가 아닌 %20으로 인코딩하고 출발지는 넘기지 않는다", () => {
    const url = naverWalkSchemeUrl(C, [B], "https://example.com");
    expect(url.startsWith("nmap://route/walk?")).toBe(true);
    expect(url).toContain(`dname=${encodeURIComponent("호맥 동래럭키점")}`);
    expect(url).not.toContain("+");
    expect(url).not.toContain("slat");
    expect(url).toContain("v1lat=35.2072");
    expect(url).toContain(`appname=${encodeURIComponent("https://example.com")}`);
  });

  it("Android intent URL은 네이버지도 패키지를 지정해 미설치 시 스토어로 가게 한다", () => {
    const url = naverWalkIntentUrl(C, [], "https://example.com");
    expect(url.startsWith("intent://route/walk?")).toBe(true);
    expect(url).toContain("scheme=nmap");
    expect(url).toContain("package=com.nhn.android.nmap;end");
  });
});

describe("detectPlatform", () => {
  it("UA로 Android / iOS / 데스크톱을 구분한다", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; SM-S918N)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("desktop");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });
});
