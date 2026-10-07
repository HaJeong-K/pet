// src/lib/publicDataPlaces.ts
//
// 신청서에 명시된 전국 단위 공공데이터 3종(관광공사·식약처·문화정보원)을 지도에
// 통합하는 클라이언트 헬퍼입니다.
//
// ⚠ 렌더링 성능 개선: 실제 집계(전국 fetch + 소스 간 중복 제거 + 반경 필터링)는
// /api/public-data/nearby 라우트(서버)가 처리합니다. 문화시설만 21,000여 건인
// 데이터를 브라우저가 매번 전량 내려받아 파싱하던 것을, 사용자 위치 반경(기본
// 40km) 안의 결과만 받도록 바꿔서 첫 화면 로딩 시간을 줄이는 게 핵심입니다.
// 위치를 아직 모르면(최초 진입 등) lat/lng 없이 호출해 예전과 동일하게 전국
// 데이터를 받습니다(하위 호환 폴백 — 지도가 "일부만 보인다"는 인상을 주지 않기
// 위함).

import { expandPlace, tileQuery } from "@/lib/mapTile";

let cachedPlaces: any[] | null = null;
// 지금 받고 있는 요청 — 같은 칸을 동시에 두 번 요청하지 않게 함께 기다립니다(예전엔 첫 화면에서 같은 요청이 두 번 나갔습니다).
const inFlight = new Map<string, Promise<any[]>>();
let cachedKey = "";
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5분 — 정부 API 호출량을 아끼기 위해 클라이언트에서도 캐시

// 장소 상세페이지의 "새로고침" 버튼처럼 사용자가 직접 최신 데이터를 요청했을 때 씁니다.
// 목록 캐시와 단건(fetchPublicDataPlaceById) 캐시를 모두 비웁니다.
export function invalidatePublicDataPlacesCache() {
  cachedPlaces = null;
  cachedKey = "";
  singleCache.clear();
}

export interface FetchPublicDataOptions {
  /** 사용자 현재 위치. 모르면 생략(전국 데이터 폴백). */
  lat?: number | null;
  lng?: number | null;
  /** 반경(km). 기본 40km — 도시 단위로 이동하며 둘러보기에 충분하면서도, 전국
   *  대비 훨씬 적은 지점만 내려받도록 하는 절충값입니다. */
  radiusKm?: number;
}

export async function fetchPublicDataPlaces(options: FetchPublicDataOptions = {}): Promise<any[]> {
  const { lat, lng } = options;
  // 좌표를 0.1도 칸의 가운데로 맞춘 주소로 요청합니다(src/lib/mapTile.ts) — 같은 동네에서는 같은 주소라
  // CDN 캐시를 함께 쓰고, 위치를 모를 때도 전국이 아니라 기준점(서울시청) 주변만 받습니다.
  const key = tileQuery(lat, lng);

  if (cachedPlaces && cachedKey === key && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPlaces;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const res = await fetch(`/api/public-data/nearby?${key}`);
      // 서버가 가볍게 줄여 보낸 것을 원래 모양으로 되돌립니다.
      const data = res.ok ? ((await res.json()) as Record<string, unknown>[]).map(expandPlace) : [];
      cachedPlaces = data;
      cachedKey = key;
      cachedAt = Date.now();
      return data;
    } catch (e) {
      console.error("공공데이터 장소 조회 실패:", e);
      return cachedPlaces || [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

// 단건 조회용 초소형 캐시 — 같은 장소 상세페이지를 짧은 시간 안에 다시 열 때
// (예: 뒤로가기→다시 진입) 네트워크를 또 타지 않도록 합니다.
const singleCache = new Map<number, { data: any; at: number }>();
const SINGLE_CACHE_TTL_MS = 60_000;

/**
 * ⚠ 장소 상세페이지 로딩 지연 수정: 예전엔 이 용도로 fetchPublicDataPlaces()(전국
 * 데이터 전체)를 받아 .find()로 하나만 골라 썼습니다 — 화면엔 그 전국 데이터가
 * 도착할 때까지 "로딩중..."만 떴습니다(캐시 없으면 10초 이상). /api/public-data/place/[id]는
 * 서버가 이미 들고 있는 병합 캐시에서 딱 하나만 찾아 그 장소 하나 분량만 내려주므로,
 * 훨씬 빠르게 응답합니다. `places` 테이블에 실제 행이 없는(공공데이터 출처) 장소를
 * 상세페이지 등에서 id 하나로 조회할 때는 fetchPublicDataPlaces() 대신 이 함수를 쓰세요.
 */
const SINGLE_FETCH_TIMEOUT_MS = 12_000;

/**
 * @returns 장소 데이터, 또는 서버에 그 장소가 없으면(404) null
 * @throws 시간 초과·네트워크·서버 오류 — "장소 없음"과 구분해서 호출부가 "다시 시도"를
 *         보여줄 수 있게 합니다(예전엔 둘 다 null이라 상세가 "로딩중..."에 멈춰 있었습니다).
 */
export async function fetchPublicDataPlaceById(id: number): Promise<any | null> {
  const cached = singleCache.get(id);
  if (cached && Date.now() - cached.at < SINGLE_CACHE_TTL_MS) return cached.data;

  const res = await fetch(`/api/public-data/place/${id}`, { signal: AbortSignal.timeout(SINGLE_FETCH_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`공공데이터 장소 조회 실패 (${res.status})`);
  const data = await res.json();
  singleCache.set(id, { data, at: Date.now() });
  return data;
}
