// src/lib/geocodeAddress.ts
//
// 카카오 로컬 API로 주소 → 위경도 변환. admin/tips 페이지(관리자 수동 승인)와
// jebo 자동 승인 흐름(AI 비전 검증 통과 시) 양쪽에서 똑같이 쓰기 위해 공용
// 헬퍼로 뺐습니다 — 예전엔 admin/tips/page.tsx 안에만 있어서 새로 추가하는
// 자동 승인 로직이 이 함수를 재사용할 수 없었습니다.

export async function geocodeAddress(address: string): Promise<{ lat: string; lng: string } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    if (data.documents?.length > 0) {
      return { lat: String(data.documents[0].y), lng: String(data.documents[0].x) };
    }
  } catch {
    // 네트워크 오류 등은 호출 쪽에서 null 처리(수동 검토로 보냄)로 대응합니다.
  }
  return null;
}
