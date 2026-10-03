// src/lib/server/kakaoLocal.ts
//
// 카카오 로컬 API(주소 검색, 좌표 → 행정구역) 서버 전용 호출.
// ⚠ 예전엔 브라우저에서 NEXT_PUBLIC_KAKAO_REST_API_KEY로 직접 불러서, 누구나 사이트 코드에서
// REST 키를 꺼내 우리 일일 한도(로컬 API 하루 10만 건)를 소진시킬 수 있었습니다. 이제 키는
// 서버 환경변수(KAKAO_REST_API_KEY)에만 두고, 브라우저는 /api/kakao/local을 거칩니다.

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local";
const KAKAO_TIMEOUT_MS = 5000;

function restKey(): string | null {
  return process.env.KAKAO_REST_API_KEY || null;
}

async function kakaoGet(path: string): Promise<any | null> {
  const key = restKey();
  if (!key) {
    console.error("[kakaoLocal] KAKAO_REST_API_KEY 환경변수가 없습니다.");
    return null;
  }
  try {
    const res = await fetch(`${KAKAO_LOCAL_BASE}${path}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[kakaoLocal] 카카오 응답 오류", res.status, path.split("?")[0]);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[kakaoLocal] 카카오 호출 실패", path.split("?")[0], e);
    return null;
  }
}

/** 주소/지역명 → 좌표. 결과가 없으면 null */
export async function kakaoAddressSearch(query: string): Promise<{ lat: number; lng: number } | null> {
  const data = await kakaoGet(`/search/address.json?query=${encodeURIComponent(query)}&size=1`);
  const doc = data?.documents?.[0];
  if (!doc) return null;
  const lat = parseFloat(doc.y);
  const lng = parseFloat(doc.x);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** 좌표 → 행정구역(시/도, 시/군/구). 결과가 없으면 null */
export async function kakaoCoordToRegion(lat: number, lng: number): Promise<{ sido: string; sigungu: string } | null> {
  const data = await kakaoGet(`/geo/coord2regioncode.json?x=${lng}&y=${lat}`);
  const doc = data?.documents?.[0];
  if (!doc) return null;
  return { sido: doc.region_1depth_name || "", sigungu: doc.region_2depth_name || "" };
}
