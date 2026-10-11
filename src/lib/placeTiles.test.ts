import { describe, expect, it } from "vitest";
import {
  boundsAround, countTilesForBounds, FINE_TILE_DEG, groupByTile, isValidTile, parseTileParams, tileBounds,
  tileDistanceKm, tileKey, tileOf, tilesForBounds, tilesForRadius,
} from "./placeTiles";

describe("지도 데이터 칸 나누기(placeTiles)", () => {
  it("좌표는 정확히 한 칸에 속하고, 그 칸의 범위 안에 있다", () => {
    let seed = 11;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 2000; i++) {
      const lat = 33 + rand() * 5.5, lng = 125 + rand() * 6;
      const tile = tileOf(lat, lng);
      const b = tileBounds(tile);
      expect(lat).toBeGreaterThanOrEqual(b.swLat - 1e-7);
      expect(lat).toBeLessThan(b.neLat + 1e-7);
      expect(lng).toBeGreaterThanOrEqual(b.swLng - 1e-7);
      expect(lng).toBeLessThan(b.neLng + 1e-7);
      expect(isValidTile(tile)).toBe(true);
    }
  });

  it("칸 경계 값(0.05의 배수)도 흔들리지 않고 같은 칸으로 간다", () => {
    // 37.55 / 0.05 는 계산상 750.9999…가 될 수 있습니다 — 751번 칸이어야 합니다.
    expect(tileOf(37.55, 126.95)).toEqual({ x: 2539, y: 751 });
    expect(tileOf(37.5999, 126.9999)).toEqual({ x: 2539, y: 751 });
    expect(tileOf(37.6, 127.0)).toEqual({ x: 2540, y: 752 });
    expect(tileKey({ x: 2539, y: 751 })).toBe("2539_751");
  });

  it("범위에 걸치는 칸: 그 범위 안의 모든 점이 돌려준 칸 중 하나에 속한다", () => {
    const bounds = { swLat: 37.52, swLng: 126.93, neLat: 37.61, neLng: 127.04 };
    const tiles = tilesForBounds(bounds);
    const keys = new Set(tiles.map(tileKey));
    expect(tiles.length).toBe(countTilesForBounds(bounds));
    for (let lat = bounds.swLat; lat <= bounds.neLat; lat += 0.007) {
      for (let lng = bounds.swLng; lng <= bounds.neLng; lng += 0.007) expect(keys.has(tileKey(tileOf(lat, lng)))).toBe(true);
    }
    // 폰 화면(약 1km × 2km)은 칸 1~4개면 됩니다.
    expect(tilesForBounds({ swLat: 37.56, swLng: 126.972, neLat: 37.578, neLng: 126.984 }).length).toBeLessThanOrEqual(4);
  });

  it("반경에 걸치는 칸: 반경 안의 점이 모두 포함되고, 반경이 클수록 칸이 많다", () => {
    const center = { lat: 35.8714, lng: 128.6014 };
    const near = new Set(tilesForRadius(center, 3).map(tileKey));
    const far = tilesForRadius(center, 15);
    expect(far.length).toBeGreaterThan(near.size);
    for (let angle = 0; angle < 360; angle += 15) {
      const rad = (angle * Math.PI) / 180;
      const lat = center.lat + (2.9 / 111) * Math.sin(rad), lng = center.lng + (2.9 / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(rad);
      expect(near.has(tileKey(tileOf(lat, lng)))).toBe(true);
    }
    const b = boundsAround(center, 3);
    expect((b.neLat - b.swLat) * 111).toBeCloseTo(6, 5);
  });

  it("우리나라 밖의 칸은 만들지 않는다", () => {
    expect(tilesForBounds({ swLat: 10, swLng: 100, neLat: 10.1, neLng: 100.1 })).toEqual([]);
    expect(isValidTile({ x: 0, y: 0 })).toBe(false);
  });

  it("칸별로 나눠 담기: 빠지거나 겹치는 항목이 없다", () => {
    const items = [
      { id: 1, lat: "37.5665", lng: "126.9780" }, { id: 2, lat: 37.5701, lng: 126.9822 }, { id: 3, lat: "35.8714", lng: "128.6014" },
      { id: 4, lat: "", lng: "" }, { id: 5, lat: "37.5999", lng: "126.9999" },
    ];
    const groups = groupByTile(items);
    const all = [...groups.values()].flat().map((i) => i.id).sort();
    expect(all).toEqual([1, 2, 3, 5]); // 좌표가 없는 4번만 빠짐
    expect(groups.get("2539_751")!.map((i) => i.id).sort()).toEqual([1, 2, 5]);
    expect(groups.get(tileKey(tileOf(35.8714, 128.6014)))!.map((i) => i.id)).toEqual([3]);
  });

  it("주소의 칸 번호 읽기: 이상한 값은 받지 않는다", () => {
    expect(parseTileParams("2539", "751")).toEqual({ x: 2539, y: 751 });
    for (const [x, y] of [[null, "751"], ["2539", null], ["abc", "751"], ["2539.5", "751"], ["-1", "751"], ["0", "0"], ["99999", "751"], ["2539", "7510"]] as [string | null, string | null][]) {
      expect(parseTileParams(x, y), `${x},${y}`).toBeNull();
    }
  });

  it("칸까지의 거리: 가까운 칸이 더 작다", () => {
    const me = { lat: 37.5665, lng: 126.978 };
    expect(tileDistanceKm(tileOf(me.lat, me.lng), me)).toBeLessThan(4);
    expect(tileDistanceKm(tileOf(37.8, 127.3), me)).toBeGreaterThan(20);
    expect(FINE_TILE_DEG).toBe(0.05);
  });
});
