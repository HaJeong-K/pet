import { describe, expect, it } from "vitest";
import { createTileStore } from "./placeTileStore";
import { tileKey, type TileXY } from "./placeTiles";

const T = (x: number, y: number): TileXY => ({ x, y });

function fakeLoader() {
  const calls: string[] = [];
  const failing = new Set<string>();
  const load = async (tile: TileXY) => {
    const key = tileKey(tile);
    calls.push(key);
    await new Promise((r) => setTimeout(r, 1));
    if (failing.has(key)) throw new Error("실패");
    return [`${key}-a`, `${key}-b`];
  };
  return { calls, failing, load };
}

describe("칸 저장소(placeTileStore)", () => {
  it("없는 칸만 받고, 받은 칸은 다시 받지 않는다", async () => {
    const f = fakeLoader();
    const store = createTileStore<string>({ load: f.load });
    expect(await store.ensure([T(2539, 751), T(2540, 751)])).toBe(true);
    expect(f.calls.sort()).toEqual(["2539_751", "2540_751"]);
    expect(store.all().sort()).toEqual(["2539_751-a", "2539_751-b", "2540_751-a", "2540_751-b"]);
    expect(await store.ensure([T(2539, 751), T(2541, 751)])).toBe(true);
    expect(f.calls.length).toBe(3); // 2541만 새로
    expect(await store.ensure([T(2539, 751)])).toBe(false);
    expect(f.calls.length).toBe(3);
    expect(store.has([T(2539, 751), T(2541, 751)])).toBe(true);
    expect(store.has([T(2539, 752)])).toBe(false);
  });

  it("같은 칸을 동시에 요청해도 한 번만 받는다", async () => {
    const f = fakeLoader();
    const store = createTileStore<string>({ load: f.load });
    await Promise.all([store.ensure([T(2539, 751)]), store.ensure([T(2539, 751)]), store.ensure([T(2539, 751), T(2540, 751)])]);
    expect(f.calls.filter((c) => c === "2539_751").length).toBe(1);
    expect(store.size()).toBe(2);
  });

  it("바뀐 게 없으면 같은 배열을 돌려준다(다시 그리지 않게)", async () => {
    const f = fakeLoader();
    const store = createTileStore<string>({ load: f.load });
    await store.ensure([T(2539, 751)]);
    const first = store.all();
    await store.ensure([T(2539, 751)]);
    expect(store.all()).toBe(first);
    await store.ensure([T(2540, 751)]);
    expect(store.all()).not.toBe(first);
  });

  it("실패한 칸은 담지 않고, 다음에 다시 받는다", async () => {
    const f = fakeLoader();
    f.failing.add("2540_751");
    const store = createTileStore<string>({ load: f.load });
    expect(await store.ensure([T(2539, 751), T(2540, 751)])).toBe(true);
    expect(store.size()).toBe(1);
    f.failing.clear();
    expect(await store.ensure([T(2540, 751)])).toBe(true);
    expect(store.size()).toBe(2);
  });

  it("칸이 너무 많으면 필요 없는 칸을 먼 것부터 버린다", async () => {
    const f = fakeLoader();
    const store = createTileStore<string>({ load: f.load });
    const row = Array.from({ length: 10 }, (_, i) => T(2530 + i, 751));
    await store.ensure(row);
    const me = { lat: 37.57, lng: 126.52 }; // 2530번 칸 근처
    expect(store.trim([T(2539, 751)], me, 20)).toBe(false); // 한도 안이면 그대로
    expect(store.trim([T(2539, 751)], me, 4)).toBe(true);
    expect(store.size()).toBe(4);
    // 남길 칸(2539)은 가장 멀어도 남고, 나머지는 가까운 2530·2531·2532가 남습니다.
    expect(store.has([T(2539, 751), T(2530, 751), T(2531, 751), T(2532, 751)])).toBe(true);
    store.clear();
    expect(store.all()).toEqual([]);
  });
});
