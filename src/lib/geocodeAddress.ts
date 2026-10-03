// src/lib/geocodeAddress.ts
//
// 카카오 로컬 API로 주소 → 위경도 변환. admin/tips 페이지(관리자 수동 승인)와
// jebo 자동 승인 흐름(AI 비전 검증 통과 시) 양쪽에서 똑같이 쓰기 위해 공용
// 헬퍼로 뺐습니다 — 예전엔 admin/tips/page.tsx 안에만 있어서 새로 추가하는
// 자동 승인 로직이 이 함수를 재사용할 수 없었습니다.
//
// 카카오 REST 키는 서버에만 둡니다: 브라우저에서는 /api/kakao/local을 거치고,
// 서버에서 불리면 서버 전용 모듈로 바로 호출합니다.

export async function geocodeAddress(address: string): Promise<{ lat: string; lng: string } | null> {
  try {
    let result: { lat: number; lng: number } | null;
    if (typeof window !== "undefined") {
      const res = await fetch(`/api/kakao/local?type=address&query=${encodeURIComponent(address)}`);
      result = res.ok ? (await res.json()).result ?? null : null;
    } else {
      const { kakaoAddressSearch } = await import("@/lib/server/kakaoLocal");
      result = await kakaoAddressSearch(address);
    }
    return result ? { lat: String(result.lat), lng: String(result.lng) } : null;
  } catch {
    // 네트워크 오류 등은 호출 쪽에서 null 처리(수동 검토로 보냄)로 대응합니다.
    return null;
  }
}
