// src/lib/parkPlaces.ts
//
// 행정안전부 — 전국도시공원정보표준데이터. 실제 집계+반경 필터링은
// /api/public-data/parks 라우트(서버)가 처리합니다(publicDataPlaces.ts와 동일한
// 이유 — 19,000여 건 전량을 클라이언트가 받지 않도록). 위치를 모르면 전국 폴백.

export interface ParkPlace {
  id: number;
  name: string;
  address: string;
  lat: string;
  lng: string;
  category: string;
  area: string | null;
  managementAgency: string | null;
  phone: string | null;
  facilityNote: string | null;
}

import { tileQuery } from "@/lib/mapTile";

let cachedParks: ParkPlace[] | null = null;
// 지금 받고 있는 요청 — 같은 칸을 동시에 두 번 요청하지 않게 함께 기다립니다.
const inFlight = new Map<string, Promise<ParkPlace[]>>();
let cachedKey = "";
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60_000; // 공원 목록은 자주 안 바뀌므로 다른 공공데이터보다 긴 캐시

export interface FetchParksOptions {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
}

export async function fetchParks(options: FetchParksOptions = {}): Promise<ParkPlace[]> {
  const { lat, lng } = options;
  // 장소(publicDataPlaces.ts)와 같은 칸 단위 주소로 요청합니다(src/lib/mapTile.ts).
  const key = tileQuery(lat, lng);

  if (cachedParks && cachedKey === key && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedParks;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const res = await fetch(`/api/public-data/parks?${key}`);
      const data = res.ok ? await res.json() : [];
      cachedParks = data;
      cachedKey = key;
      cachedAt = Date.now();
      return data as ParkPlace[];
    } catch (e) {
      console.error("공원 데이터 조회 실패:", e);
      return cachedParks || [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
