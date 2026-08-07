// ⚠ 폐기 예정 — 옛 AWS(API Gateway) 백엔드 호출용이었으나, 전국 장소 데이터가
// Supabase `places` 테이블로 전량 이관되면서(scripts/migrate-aws-to-supabase.mjs,
// 2026-08-03) 더 이상 어디에서도 호출되지 않는 죽은 코드입니다(KakaoMap.tsx의
// import도 함께 제거했습니다). NEXT_PUBLIC_API_URL이 .env에 없으면 아래 URL이
// "undefined/places"가 되어 호출 시 조용히 실패하니, 되살리지 말고 필요하면
// src/lib/awsPlaces.ts와 함께 정리(git rm)하는 걸 권장합니다.
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function getPlaces() {
  const res = await fetch(`${API_URL}/places`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("장소 조회 실패");
  }

  return res.json();
}