import { describe, expect, it } from "vitest";
import {
  blockKey, blocksForBounds, bubblesFromPoints, bubblesFromRows, buildCountBlocks, cellDegForCloseLevel, cellDegForLevel, countLevel, formatBubbleCount,
  parseCountParams, placeCountOf, type CountFilter, type CountRow,
} from "./tileCounts";

// 서울시청 근처 6곳, 동쪽으로 3~4km 떨어진 2곳, 대구 1곳
const places = [
  { lat: "37.5665", lng: "126.9780", category: "카페", pet_zone: "indoor" },
  { lat: "37.5666", lng: "126.9781", category: "카페", pet_zone: "both" },
  { lat: "37.5667", lng: "126.9782", category: "쇼핑", pet_zone: "terrace" },
  { lat: "37.5668", lng: "126.9783", category: "동물병원", pet_zone: "indoor" },
  { lat: "37.5669", lng: "126.9784", category: "동물약국", pet_zone: "indoor" },
  { lat: "37.5670", lng: "126.9785", category: "미용", pet_zone: null },
  { lat: "37.5700", lng: "127.0100", category: "카페", pet_zone: "indoor" },
  { lat: "37.5700", lng: "127.0200", category: "동물병원", pet_zone: "both" },
  { lat: "35.8714", lng: "128.6014", category: "카페", pet_zone: "indoor" },
  { lat: "", lng: "", category: "카페", pet_zone: "indoor" }, // 좌표 없음 — 세지 않음
];
const parks = [{ lat: "37.5651", lng: "126.9770" }, { lat: "37.5655", lng: "126.9775" }, { lat: "35.87", lng: "128.60" }];
const seoulView = { swLat: 37.52, swLng: 126.93, neLat: 37.6, neLng: 127.04 };
const koreaView = { swLat: 33, swLng: 124.5, neLat: 39, neLng: 131 };

/** 브라우저가 하는 일 그대로: 화면에 걸치는 묶음을 받아 동그라미로 */
function bubblesFor(view: typeof seoulView, level: number, filter: CountFilter = "all", includeParks = true, extra: { lat: number; lng: number }[] = []) {
  const blocks = buildCountBlocks(places, parks, level);
  const rows: CountRow[] = blocksForBounds(view, level).flatMap((b) => blocks.get(blockKey(b.bx, b.by)) ?? []);
  return bubblesFromRows(rows, view, level, filter, includeParks, extra);
}
const sum = (list: { count: number }[]) => list.reduce((s, b) => s + b.count, 0);

describe("구역별 장소 수(tileCounts)", () => {
  it("구역 크기는 한 단계 넓어질 때마다 2배, 범위를 벗어난 단계는 가장 가까운 값", () => {
    expect(cellDegForLevel(6)).toBeCloseTo(0.0125, 10);
    expect(cellDegForLevel(7) / cellDegForLevel(6)).toBe(2);
    expect(cellDegForLevel(9)).toBeCloseTo(0.1, 10);
    expect([3, 6, 9, 14, 20].map(countLevel)).toEqual([6, 6, 9, 14, 14]);
  });

  it("버튼 규칙대로 센다(병원·약국은 실내/야외 수에서 빠짐)", () => {
    const rows = [...buildCountBlocks(places, parks, 9).values()].flat();
    const seoul = rows.find((r) => r[2] === 6)!; // 시청 근처 6곳이 한 구역
    expect(seoul.slice(2, 8)).toEqual([6, 1, 1, 1, 1, 1]); // 전체 6 · 실내 1 · 야외 1 · 실내외 1 · 병원 1 · 약국 1
    expect(seoul[10]).toBe(2); // 공원
    expect(seoul[8]).toBeCloseTo(37.5668, 3);
    for (const f of ["all", "indoor", "terrace", "both", "vet", "pharmacy"] as CountFilter[]) expect(placeCountOf(seoul, f)).toBe(f === "all" ? 6 : 1);
    expect(rows.reduce((s, r) => s + r[2], 0)).toBe(9);
  });

  it("어느 확대 단계에서도 화면 안의 수를 빠짐없이 센다", () => {
    // (아주 넓게 볼 때는 구역 하나가 수백 km라, 화면에 걸친 구역의 수가 통째로 보입니다 — 그래서 서울 화면은 11단계까지만 봅니다.)
    for (let level = 6; level <= 11; level++) {
      const seoul = bubblesFor(seoulView, level);
      expect(sum(seoul), `서울 화면 · ${level}단계`).toBe(8); // 대구 1곳은 화면 밖
      expect(seoul.reduce((s, b) => s + b.parkCount, 0)).toBe(2);
    }
    // 전국이 한 화면에 들어오는 것은 13~14단계입니다(그보다 확대된 단계에서 전국 범위를 요청하는 일은 없습니다).
    for (let level = 13; level <= 14; level++) expect(sum(bubblesFor(koreaView, level)), `전국 화면 · ${level}단계`).toBe(9);
  });

  it("넓게 볼수록 동그라미가 합쳐진다", () => {
    expect(bubblesFor(seoulView, 6).length).toBe(3); // 시청 6곳 / 동쪽 2곳은 각각
    expect(bubblesFor(seoulView, 9).length).toBeLessThanOrEqual(2);
    expect(bubblesFor(koreaView, 14).length).toBeLessThanOrEqual(2); // 수도권 / 대구
  });

  it("버튼을 고르면 그 종류만 세고, 공원을 끄면 공원은 0", () => {
    expect(sum(bubblesFor(seoulView, 8, "vet", false))).toBe(2);
    expect(sum(bubblesFor(seoulView, 8, "indoor", false))).toBe(2);
    expect(sum(bubblesFor(seoulView, 8, "pharmacy", true))).toBe(1);
    expect(bubblesFor(seoulView, 8, "pharmacy", false).every((b) => b.parkCount === 0)).toBe(true);
    // 해당 종류가 하나도 없는 화면이면 동그라미도 없음
    expect(bubblesFor({ swLat: 35.8, swLng: 128.5, neLat: 35.95, neLng: 128.7 }, 8, "vet", false)).toEqual([]);
  });

  it("동그라미 위치는 그 구역 장소들의 평균 위치", () => {
    const big = bubblesFor(seoulView, 6).find((b) => b.count === 6)!;
    expect(big.lat).toBeCloseTo(37.5668, 3);
    expect(big.lng).toBeCloseTo(126.9783, 3);
    const park = bubblesFor(seoulView, 9).find((b) => b.parkCount === 2)!;
    expect(park.parkLat).toBeCloseTo(37.5653, 3);
  });

  it("서버 집계에 없는 장소(직접 등록된 곳)도 더한다", () => {
    expect(sum(bubblesFor(seoulView, 8, "all", false, [{ lat: 37.57, lng: 126.98 }, { lat: 10, lng: 10 }]))).toBe(9);
  });

  it("한 화면에 필요한 묶음은 몇 개 안 된다(요청 수가 적다)", () => {
    // 6단계의 PC 화면(약 10km × 7km)과 폰 화면(약 3km × 6km)
    expect(blocksForBounds({ swLat: 37.53, swLng: 126.92, neLat: 37.6, neLng: 127.04 }, 6).length).toBeLessThanOrEqual(6);
    expect(blocksForBounds({ swLat: 37.54, swLng: 126.96, neLat: 37.6, neLng: 126.995 }, 6).length).toBeLessThanOrEqual(4);
    expect(blocksForBounds(koreaView, 14).length).toBeLessThanOrEqual(4);
    // 잘못된 범위로도 요청이 쏟아지지 않는다
    expect(blocksForBounds({ swLat: -90, swLng: -180, neLat: 90, neLng: 180 }, 6).length).toBeLessThanOrEqual(16);
  });

  it("주소의 값 읽기: 이상한 값은 받지 않는다", () => {
    expect(parseCountParams("8", "317", "93")).toEqual({ level: 8, bx: 317, by: 93 });
    for (const [l, x, y] of [["5", "1", "1"], ["15", "1", "1"], ["8", "-1", "1"], ["8", "1.5", "1"], ["a", "1", "1"], [null, "1", "1"], ["8", "999999", "1"]] as [string | null, string | null, string | null][]) {
      expect(parseCountParams(l, x, y), `${l},${x},${y}`).toBeNull();
    }
  });

  it("가까이 볼 때: 받아 둔 장소를 화면에서 바로 구역별로 센다", () => {
    expect(cellDegForCloseLevel(5)).toBeCloseTo(cellDegForLevel(6) / 2, 10);
    expect(cellDegForCloseLevel(4)).toBeCloseTo(cellDegForLevel(6) / 4, 10);
    const view = { swLat: 37.56, swLng: 126.97, neLat: 37.575, neLng: 127.015 };
    const bubbles = bubblesFromPoints(places, parks, view, cellDegForCloseLevel(5));
    // 화면 안: 시청 근처 6곳 + 127.01의 1곳(127.02는 화면 밖), 공원 2곳
    expect(bubbles.reduce((s, b) => s + b.count, 0)).toBe(7);
    expect(bubbles.reduce((s, b) => s + b.parkCount, 0)).toBe(2);
    const big = bubbles.find((b) => b.count === 6)!;
    expect(big.lat).toBeCloseTo(37.5668, 3);
    // 좌표가 잘못된 항목과 화면 밖은 세지 않음
    expect(bubblesFromPoints([{ lat: "", lng: "" }, { lat: 10, lng: 10 }], [], view, 0.01)).toEqual([]);
  });

  it("숫자 표기", () => {
    expect([7, 999, 9999, 10000, 12741, 123456].map(formatBubbleCount)).toEqual(["7", "999", "9999", "1만", "1.3만", "12만"]);
  });
});
