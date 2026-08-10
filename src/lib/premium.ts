// src/lib/premium.ts
//
// "지금 이 순간 프리미엄이 유효한가"를 판정하는 공용 함수입니다.
// places.is_premium이 true여도 premium_expires_at이 지났으면 더 이상 프리미엄이
// 아니므로(관리자가 매번 배치로 false 처리하지 않아도 자연스럽게 만료되도록), 화면에
// 표시할 때는 항상 이 함수로 한 번 더 걸러서 씁니다 — 지도 추천점수, 배지, SideAdRail
// 세 곳 모두 이 기준을 공유합니다.
export function isPlacePremiumNow(place: { is_premium?: boolean | null; premium_expires_at?: string | null } | null | undefined): boolean {
  if (!place?.is_premium) return false;
  if (!place.premium_expires_at) return false; // 만료일이 없으면 프리미엄으로 보지 않음(승인 시 항상 채워짐)
  return new Date(place.premium_expires_at).getTime() > Date.now();
}
