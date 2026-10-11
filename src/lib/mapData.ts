// src/lib/mapData.ts
//
// 지도 화면이 쓰는 데이터 창구(브라우저 전용): 칸 단위로 받은 공공데이터 장소·공원을 모아 둡니다.
// 칸 규칙은 src/lib/placeTiles.ts, 모아 두는 방식은 src/lib/placeTileStore.ts를 보세요.

import { expandPlace } from "@/lib/mapTile";
import { createTileStore } from "@/lib/placeTileStore";
import type { TileXY } from "@/lib/placeTiles";
import type { ParkPlace } from "@/lib/parkPlaces";
import { countLevel, type CountRow } from "@/lib/tileCounts";

async function getJson(url: string): Promise<unknown[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`${url} → 목록이 아님`);
  return data;
}

/** 공공데이터 장소(칸 단위). 서버가 가볍게 줄여 보낸 것을 원래 모양으로 되돌려 담습니다. */
export const placeTiles = createTileStore<any>({
  load: async (tile) => ((await getJson(`/api/public-data/nearby?tx=${tile.x}&ty=${tile.y}`)) as Record<string, unknown>[]).map(expandPlace),
});

/** 공원(칸 단위) */
export const parkTiles = createTileStore<ParkPlace>({
  load: async (tile) => (await getJson(`/api/public-data/parks?tx=${tile.x}&ty=${tile.y}`)) as ParkPlace[],
});

/** 장소·공원 두 가지를 함께 받습니다. 둘 중 하나라도 새 칸이 들어왔으면 true */
export async function ensureMapTiles(tiles: TileXY[]): Promise<boolean> {
  const [a, b] = await Promise.all([placeTiles.ensure(tiles), parkTiles.ensure(tiles)]);
  return a || b;
}

/**
 * 가게 이름으로 전국에서 찾습니다(가까운 순, 최대 60곳). 화면 밖의 가게는 받아 둔 칸에 없으므로 서버에 묻습니다.
 * near는 가까운 순 정렬 기준이며, 주소에 정확한 위치가 실리지 않도록 0.1도 단위로만 보냅니다.
 */
export async function searchPlacesByName(query: string, near: { lat: number; lng: number } | null): Promise<any[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const where = near ? `&lat=${near.lat.toFixed(1)}&lng=${near.lng.toFixed(1)}` : "";
  try {
    return ((await getJson(`/api/public-data/search?q=${encodeURIComponent(q)}${where}`)) as Record<string, unknown>[]).map(expandPlace);
  } catch {
    return [];
  }
}

// ── 구역별 장소 수(지도를 넓게 볼 때의 동그라미 숫자) ──
// 확대 단계·묶음별로 한 번 받으면 10분 동안 다시 받지 않습니다(같은 묶음을 받는 중이면 함께 기다립니다).
const countBlocks = new Map<string, { at: number; rows: Promise<CountRow[]> }>();
const COUNTS_TTL_MS = 10 * 60_000;
const COUNTS_MAX_ENTRIES = 400;

/** 그 확대 단계에서, 묶음들의 구역별 장소 수를 모두 받아 한 목록으로 돌려줍니다. 실패한 묶음은 빈 목록(다음에 다시 시도). */
export async function fetchCountBlocks(level: number, blocks: { bx: number; by: number }[]): Promise<CountRow[]> {
  const l = countLevel(level);
  const lists = await Promise.all(blocks.map(({ bx, by }) => {
    if (bx < 0 || by < 0) return Promise.resolve([] as CountRow[]);
    const key = `${l}:${bx}_${by}`;
    const held = countBlocks.get(key);
    if (held && Date.now() - held.at < COUNTS_TTL_MS) return held.rows;
    if (countBlocks.size >= COUNTS_MAX_ENTRIES) countBlocks.clear();
    const rows = getJson(`/api/public-data/counts?level=${l}&bx=${bx}&by=${by}`)
      .then((data) => data as CountRow[])
      .catch(() => { countBlocks.delete(key); return [] as CountRow[]; });
    countBlocks.set(key, { at: Date.now(), rows });
    return rows;
  }));
  return lists.flat();
}
