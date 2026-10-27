"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import { nextFirstTouch, touchFrom, type Touch } from "@/lib/trafficSource";

// 전체 페이지 조회(page_view)를 기록하는 보이지 않는 트래커.
// layout.tsx에 한 번만 마운트해서 경로가 바뀔 때마다(라우트 이동) 이벤트를 보냅니다.
// 관리자 통계 분석 탭의 일간/월간/연간 이용자 추이·재방문율 계산에 씁니다.
//
// 유입 경로(src/lib/trafficSource.ts)도 함께 남깁니다 — 마케팅 채널별 방문·회원 전환·재방문을 보기 위해.
//   src  : 이번 방문을 데려온 채널(방문을 시작한 첫 화면에서 정해 이번 방문 동안 유지)
//   fsrc : 이 기기를 처음 데려온 채널(90일 기억)
//   cmp  : 홍보 링크에 붙인 캠페인 이름(있을 때만)
const SESSION_KEY = "ggk_touch_session_v1";
const FIRST_KEY = "ggk_touch_first_v1";

function readTouch(storage: Storage, key: string): Touch | null {
  try { const v = JSON.parse(storage.getItem(key) || "null"); return v && typeof v.src === "string" ? v : null; } catch { return null; }
}

/** 이번 방문과 첫 유입을 정해 기억해 둡니다(저장소를 못 쓰면 이번 화면 기준으로만) */
function currentTouches(): { session: Touch; first: Touch } {
  let session = readTouch(sessionStorage, SESSION_KEY);
  // 홍보 링크(꼬리표가 붙은 주소)로 들어오면 같은 방문 중이어도 그 채널로 바꿉니다.
  const tagged = /[?&](utm_source|ref)=/.test(window.location.search);
  if (!session || tagged) {
    session = touchFrom(window.location.search, document.referrer, window.location.hostname);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* 저장 못 해도 기록은 보냅니다 */ }
  }
  const first = nextFirstTouch(readTouch(localStorage, FIRST_KEY), session);
  try { localStorage.setItem(FIRST_KEY, JSON.stringify(first)); } catch { /* 저장 못 해도 기록은 보냅니다 */ }
  return { session, first };
}

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    let touches: { session: Touch; first: Touch } | null = null;
    try { touches = currentTouches(); } catch { touches = null; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      trackEvent("page_view", {
        path: pathname,
        authUserId: session?.user?.id ?? null,
        meta: touches ? { src: touches.session.src, fsrc: touches.first.src, ...(touches.session.cmp ? { cmp: touches.session.cmp } : {}) } : null,
      });
    });
  }, [pathname]);

  return null;
}
