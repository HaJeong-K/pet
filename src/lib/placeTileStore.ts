// src/lib/placeTileStore.ts
//
// 칸 단위로 받은 지도 데이터를 브라우저에서 모아 두는 곳(장소용·공원용 각각 하나).
//
//  - ensure(칸 목록): 아직 없는 칸만 받습니다. 받고 있는 칸은 함께 기다립니다(같은 칸을 두 번 받지 않음).
//  - all(): 지금까지 받은 칸의 내용을 한 목록으로. 바뀐 게 없으면 같은 배열을 그대로 돌려줍니다
//           (React가 "안 바뀌었다"고 알 수 있어 불필요하게 다시 그리지 않습니다).
//  - trim(남길 칸, 기준점): 칸이 너무 많이 쌓이면 지금 필요 없는 칸을 먼 것부터 버립니다 — 지도를 오래
//           돌아다녀도 들고 있는 장소 수가 계속 불어나지 않게(예전 방식의 근본 문제).
//
// 칸 계산 규칙은 src/lib/placeTiles.ts에 있습니다.

import { tileDistanceKm, tileKey, type TileXY } from "@/lib/placeTiles";

export type TileStore<T> = {
  /** 없는 칸을 받아 옵니다. 새로 들어온 칸이 하나라도 있으면 true */
  ensure: (tiles: TileXY[]) => Promise<boolean>;
  /** 그 칸들을 이미 다 갖고 있는지 */
  has: (tiles: TileXY[]) => boolean;
  all: () => T[];
  /** keep에 없는 칸을, 갖고 있는 칸이 max개 이하가 될 때까지 기준점에서 먼 것부터 버립니다. 버렸으면 true */
  trim: (keep: TileXY[], near: { lat: number; lng: number }, max: number) => boolean;
  clear: () => void;
  size: () => number;
};

export function createTileStore<T>(options: {
  /** 칸 하나의 내용을 받아 오는 함수(실패하면 예외) */
  load: (tile: TileXY) => Promise<T[]>;
  /** 한 번에 받는 칸 수(기본 6) */
  concurrency?: number;
}): TileStore<T> {
  const tiles = new Map<string, { tile: TileXY; items: T[] }>();
  const inFlight = new Map<string, Promise<boolean>>();
  let merged: T[] | null = [];

  const loadOne = (tile: TileXY): Promise<boolean> => {
    const key = tileKey(tile);
    if (tiles.has(key)) return Promise.resolve(false);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const request = options.load(tile)
      .then((items) => { tiles.set(key, { tile, items }); merged = null; return true; })
      // 실패한 칸은 담지 않습니다 — 다음에 다시 필요해지면 그때 다시 받습니다.
      .catch(() => false)
      .finally(() => { inFlight.delete(key); });
    inFlight.set(key, request);
    return request;
  };

  return {
    async ensure(wanted) {
      const missing = wanted.filter((tile) => !tiles.has(tileKey(tile)));
      if (missing.length === 0) return false;
      const limit = Math.max(1, options.concurrency ?? 6);
      let changed = false, next = 0;
      const worker = async () => {
        while (next < missing.length) {
          const tile = missing[next++];
          if (await loadOne(tile)) changed = true;
        }
      };
      await Promise.all(Array.from({ length: Math.min(limit, missing.length) }, worker));
      return changed;
    },
    has: (wanted) => wanted.every((tile) => tiles.has(tileKey(tile))),
    all() {
      if (merged === null) {
        merged = [];
        for (const entry of tiles.values()) for (const item of entry.items) merged.push(item);
      }
      return merged;
    },
    trim(keep, near, max) {
      if (tiles.size <= max) return false;
      const keepKeys = new Set(keep.map(tileKey));
      const removable = [...tiles.entries()]
        .filter(([key]) => !keepKeys.has(key))
        .sort((a, b) => tileDistanceKm(b[1].tile, near) - tileDistanceKm(a[1].tile, near));
      let removed = false;
      for (const [key] of removable) {
        if (tiles.size <= max) break;
        tiles.delete(key);
        removed = true;
      }
      if (removed) merged = null;
      return removed;
    },
    clear() { tiles.clear(); merged = []; },
    size: () => tiles.size,
  };
}
