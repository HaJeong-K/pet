"use client";

import { useEffect, useState } from "react";

// SSR 환경(Next.js)에서는 window가 없어서, 서버 렌더링 시점엔 항상 false로 시작하고
// 마운트된 뒤 실제 뷰포트 기준으로 업데이트합니다(하이드레이션 불일치 방지 — 이
// 프로젝트의 다른 곳들(예: 검색어 localStorage 복원)도 같은 "마운트 후 갱신" 패턴을 씁니다).
// 리사이즈/분할화면 전환(모바일 회전, 브라우저 창 크기 변경, 데스크톱 분할화면 등)에도
// 실시간으로 반응하도록 matchMedia의 change 이벤트를 구독합니다.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
