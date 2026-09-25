"use client";

// src/lib/recFatigue.ts
//
// 추천 노출 피로도 기록 — "여러 번 추천됐는데 한 번도 누르지 않은 장소"를 알아내기 위한
// 브라우저 로컬 기록입니다(오늘의집 Twiddler의 Downrank와 같은 취지). 개인 기기에만
// 저장되고 서버로 보내지 않습니다. 저장소 접근이 막힌 환경(시크릿 모드 등)에서는 조용히
// 빈 기록으로 동작해 추천 자체에는 영향이 없습니다.

import { RECOMMEND_V2_WEIGHTS } from "@/lib/scoringConfig";

const STORAGE_KEY = "ggk_rec_impressions";
const MAX_ENTRIES = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

type Entry = { n: number; first: number };
type Store = Record<string, Entry>;

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    const entries = Object.entries(store);
    // 오래된 기록부터 잘라 저장 용량이 무한정 늘지 않게 합니다.
    const trimmed =
      entries.length > MAX_ENTRIES
        ? Object.fromEntries(entries.sort((a, b) => b[1].first - a[1].first).slice(0, MAX_ENTRIES))
        : store;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 실패는 무시 */
  }
}

function prune(store: Store, now: number): Store {
  const windowMs = RECOMMEND_V2_WEIGHTS.FATIGUE_WINDOW_DAYS * DAY_MS;
  const out: Store = {};
  for (const [id, e] of Object.entries(store)) {
    if (e && typeof e.n === "number" && now - e.first < windowMs) out[id] = e;
  }
  return out;
}

/** 장소 id → 최근 노출 횟수 */
export function getImpressionCounts(): Map<string, number> {
  const store = prune(read(), Date.now());
  return new Map(Object.entries(store).map(([id, e]) => [id, e.n]));
}

/** 추천 목록에 노출된 장소들을 1회씩 기록 */
export function recordImpressions(placeIds: (string | number)[]) {
  const now = Date.now();
  const store = prune(read(), now);
  for (const raw of placeIds) {
    const id = String(raw);
    const prev = store[id];
    store[id] = prev ? { n: prev.n + 1, first: prev.first } : { n: 1, first: now };
  }
  write(store);
}

/** 사용자가 클릭한 장소는 피로도 기록을 지웁니다(관심이 있다는 신호) */
export function clearImpression(placeId: string | number) {
  const store = read();
  delete store[String(placeId)];
  write(store);
}
