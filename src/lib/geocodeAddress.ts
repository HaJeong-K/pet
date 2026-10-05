// src/lib/geocodeAddress.ts
//
// 카카오 로컬 API로 주소 → 위경도 변환. admin/tips 페이지(관리자 수동 승인)와
// jebo 자동 승인 흐름(AI 비전 검증 통과 시) 양쪽에서 똑같이 쓰기 위해 공용
// 헬퍼로 뺐습니다 — 예전엔 admin/tips/page.tsx 안에만 있어서 새로 추가하는
// 자동 승인 로직이 이 함수를 재사용할 수 없었습니다.
//
// 카카오 REST 키는 서버에만 둡니다: 브라우저에서는 /api/kakao/local을 거치고,
// 서버에서 불리면 서버 전용 모듈로 바로 호출합니다.

// 제보 화면의 "상세 주소"(층·호수 등)는 기본 주소 뒤에 이 구분자로 붙여 저장합니다.
// 도로명·지번 주소에는 쉼표가 들어가지 않아, 쉼표 앞부분만 떼면 검색된 원래 주소가 됩니다.
const DETAIL_SEPARATOR = ", ";

/** 기본 주소와 상세 주소를 한 줄로 합칩니다(상세 주소가 없으면 기본 주소 그대로). */
export function joinAddress(base: string, detail: string): string {
  const b = base.trim();
  const d = detail.trim().replace(/^[,\s]+/, "");
  return d ? `${b}${DETAIL_SEPARATOR}${d}` : b;
}

/** 합쳐진 주소에서 상세 주소를 뗀 기본 주소(좌표 변환용). */
export function baseAddress(address: string): string {
  const i = address.indexOf(",");
  return (i < 0 ? address : address.slice(0, i)).trim();
}

async function lookup(address: string): Promise<{ lat: number; lng: number } | null> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/kakao/local?type=address&query=${encodeURIComponent(address)}`);
    return res.ok ? (await res.json()).result ?? null : null;
  }
  const { kakaoAddressSearch } = await import("@/lib/server/kakaoLocal");
  return kakaoAddressSearch(address);
}

export async function geocodeAddress(address: string): Promise<{ lat: string; lng: string } | null> {
  try {
    // 상세 주소(층·호수)가 붙어 있으면 주소 검색이 실패하므로 기본 주소로 찾습니다.
    const base = baseAddress(address);
    let result = base ? await lookup(base) : null;
    if (!result && base !== address.trim()) result = await lookup(address.trim());
    return result ? { lat: String(result.lat), lng: String(result.lng) } : null;
  } catch {
    // 네트워크 오류 등은 호출 쪽에서 null 처리(수동 검토로 보냄)로 대응합니다.
    return null;
  }
}
