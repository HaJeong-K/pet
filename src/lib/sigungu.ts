// src/lib/sigungu.ts
//
// 시·군·구 단위로 "내 지역 → 가까운 지역" 순서를 정하는 계산(유기동물 공고의 위치 기반 노출용).
//   · 공고번호의 지역 표기("경북-포항-…", "부산-해운대-…", "경남-창원1-…")와
//     카카오가 주는 행정구역 이름("포항시 남구", "해운대구")을 같은 모양으로 맞추고
//   · 시·군·구 중심 좌표(sigunguCentroids.json — 전국 도시공원 공공데이터의 공원 좌표 평균으로 만든 값)로
//     가까운 순서를 계산합니다.
// 화면·서버가 함께 쓰는 순수 함수라 테스트하기 쉽습니다(sigungu.test.ts).

import centroids from "./sigunguCentroids.json";

type LatLng = { lat: number; lng: number };
const CENTROIDS = centroids as Record<string, number[]>;

/**
 * 시·군·구 이름을 공고번호 표기와 같은 짧은 모양으로 바꿉니다.
 *   "포항시 남구" → "포항", "해운대구" → "해운대", "달성군" → "달성", "창원1" → "창원"
 *   "남구"·"중구"처럼 떼면 한 글자만 남는 이름은 그대로 둡니다.
 */
export function normalizeSigungu(name: string | null | undefined): string {
  const first = (name || "").trim().split(/\s+/)[0].replace(/\d+$/, "");
  if (first.length <= 2) return first;
  return first.replace(/(특별자치시|시|군|구)$/, "");
}

const key = (sido: string, sub: string) => `${sido}|${normalizeSigungu(sub)}`;

export function sigunguCentroid(sido: string, sub: string): LatLng | null {
  const c = CENTROIDS[key(sido, sub)];
  return c ? { lat: c[0], lng: c[1] } : null;
}

function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type NearbyInput = {
  /** 사용자가 있는 시·도(짧은 이름) */
  sido: string;
  /** 사용자가 있는 시·군·구(카카오 표기 그대로 넣어도 됩니다). 모르면 좌표로 가장 가까운 곳을 씁니다. */
  sigungu?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type NearbyResult<T> = {
  /** 내 지역 공고 → 가까운 지역 공고 순서(각 지역 안에서는 원래 순서 유지) */
  notices: T[];
  /** 내 지역(짧은 이름). 판단할 수 없으면 null */
  ownSub: string | null;
  /** 내 지역 공고 수 */
  ownCount: number;
  /** 목록에 포함된 지역(내 지역부터 가까운 순) */
  subs: string[];
};

/**
 * 내 지역 공고를 먼저 놓고, min건이 안 되면 가장 가까운 지역부터 차례로 더합니다.
 * @param notices 같은 시·도의 공고(마감임박순 등 원하는 순서로 정렬된 상태)
 */
export function pickNearbyNotices<T extends { region: string; subRegion: string }>(
  notices: T[],
  input: NearbyInput,
  min = 4
): NearbyResult<T> {
  const groups = new Map<string, T[]>();
  for (const n of notices) {
    const sub = normalizeSigungu(n.subRegion);
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub)!.push(n);
  }

  const hasCoords = typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng);
  const ownSub = normalizeSigungu(input.sigungu) || null;
  // 거리 기준점: 실제 좌표가 있으면 그 좌표, 없으면 내 시·군·구의 중심
  const origin: LatLng | null = hasCoords
    ? { lat: input.lat as number, lng: input.lng as number }
    : ownSub ? sigunguCentroid(input.sido, ownSub) : null;

  const distanceOf = (sub: string): number => {
    if (!origin) return Number.POSITIVE_INFINITY;
    // 공고의 지역 이름으로 중심을 찾습니다(같은 이름이 다른 시·도에도 있어서 그 공고의 시·도와 함께 찾음).
    const sample = groups.get(sub)![0];
    const c = sigunguCentroid(sample.region || input.sido, sub) ?? sigunguCentroid(input.sido, sub);
    return c ? distanceKm(origin, c) : Number.POSITIVE_INFINITY;
  };

  const others = [...groups.keys()]
    .filter((sub) => sub !== ownSub)
    .map((sub) => ({ sub, d: distanceOf(sub) }))
    .sort((a, b) => a.d - b.d || groups.get(b.sub)!.length - groups.get(a.sub)!.length)
    .map((x) => x.sub);

  const subs: string[] = [];
  const picked: T[] = [];
  const ownCount = ownSub && groups.has(ownSub) ? groups.get(ownSub)!.length : 0;
  if (ownSub && ownCount > 0) { subs.push(ownSub); picked.push(...groups.get(ownSub)!); }
  for (const sub of others) {
    if (picked.length >= min) break;
    subs.push(sub);
    picked.push(...groups.get(sub)!);
  }
  return { notices: picked, ownSub, ownCount, subs };
}
