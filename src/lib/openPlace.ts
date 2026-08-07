// src/lib/openPlace.ts
//
// 장소 상세로 이동하는 공통 헬퍼. 예전엔 동물병원·동물약국 카테고리를 별도 팝업창으로
// 열었지만(문화정보원 CSV를 카테고리3만 쓰도록 바꾼 뒤 대다수 장소가 이 카테고리로
// 뭉치면서 거의 모든 클릭이 팝업으로 새고 있었습니다), 사용자 요청에 따라 전부
// 인앱 모달(Next.js Intercepting Routes, src/app/@modal/(.)place/[id]/page.tsx)로
// 통일했습니다. 팝업창은 더 이상 카테고리로 분기하지 않고, 모달 인터셉트 자체가
// 실패하는 예외 상황에서만 place/[id]/page.tsx가 스스로 감지해 팝업으로 전환합니다
// (그 로직은 이 파일이 아니라 page.tsx의 standalone 감지 useEffect를 참고).
export interface MinimalRouter {
  push: (href: string) => void;
}

export interface MinimalPlace {
  id: number | string;
  category?: string | null;
}

export function openPlaceDetail(router: MinimalRouter, place: MinimalPlace | null | undefined) {
  if (!place) return;
  router.push(`/place/${place.id}`);
}
