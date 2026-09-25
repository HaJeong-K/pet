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

let cachedPlaces: any[] | null = null;
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
  const { lat, lng, radiusKm = 40 } = options;
  // 캐시 키에 위치를 (대략) 반영 — 사용자가 다른 지역으로 이동하면 그 지역 데이터를
  // 다시 받아야 하므로, 소수점 첫째 자리(~11km 단위)로 반올림해 같은 동네 안에서의
  // 자잘한 좌표 변화는 캐시를 재사용하도록 합니다.
  const key =
    lat != null && lng != null ? `${lat.toFixed(1)},${lng.toFixed(1)},${radiusKm}` : "nationwide";

  if (cachedPlaces && cachedKey === key && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPlaces;
  }

  try {
    const params = new URLSearchParams();
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
      params.set("radiusKm", String(radiusKm));
    }
    const res = await fetch(`/api/public-data/nearby?${params.toString()}`);
    const data = res.ok ? await res.json() : [];
    cachedPlaces = data;
    cachedKey = key;
    cachedAt = Date.now();
    return data;
  } catch (e) {
    console.error("공공데이터 장소 조회 실패:", e);
    return cachedPlaces || [];
  }
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
export async function fetchPublicDataPlaceById(id: number): Promise<any | null> {
  const cached = singleCache.get(id);
  if (cached && Date.now() - cached.at < SINGLE_CACHE_TTL_MS) return cached.data;

  try {
    const res = await fetch(`/api/public-data/place/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    singleCache.set(id, { data, at: Date.now() });
    return data;
  } catch (e) {
    console.error("공공데이터 장소 단건 조회 실패:", e);
    return null;
  }
}
