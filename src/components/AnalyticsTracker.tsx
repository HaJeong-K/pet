"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

// 전체 페이지 조회(page_view)를 기록하는 보이지 않는 트래커.
// layout.tsx에 한 번만 마운트해서 경로가 바뀔 때마다(라우트 이동) 이벤트를 보냅니다.
// 관리자 통계 분석 탭의 일간/월간/연간 이용자 추이·재방문율 계산에 씁니다.
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      trackEvent("page_view", { path: pathname, authUserId: session?.user?.id ?? null });
    });
  }, [pathname]);

  return null;
}
