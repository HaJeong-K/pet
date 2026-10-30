"use client";
// src/components/SessionKeepGuard.tsx
//
// "로그인 상태 유지"를 끄고 로그인한 경우, 브라우저를 완전히 닫았다가 다시 열면 로그아웃합니다.
//   · 로그인할 때 유지를 끄면 localStorage에 표시(SESSION_ONLY_KEY)를 두고, 브라우저를 닫으면 사라지는 쿠키(ALIVE_COOKIE)를 굽습니다.
//   · 다음에 열었을 때 표시는 있는데 쿠키가 없으면 = 브라우저를 닫았다 연 것 → 로그아웃.
//   · 같은 브라우저의 다른 탭은 쿠키를 같이 쓰므로, 새 탭을 연다고 로그아웃되지 않습니다.
// 화면에는 아무것도 그리지 않습니다.

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const SESSION_ONLY_KEY = "ggk-auth-session-only";
const ALIVE_COOKIE = "ggk_auth_alive";

/** 로그인 직후 부릅니다. keep=false면 브라우저를 닫을 때 로그아웃되게 표시합니다. */
export function rememberLoginChoice(keep: boolean) {
  try {
    if (keep) localStorage.removeItem(SESSION_ONLY_KEY);
    else {
      localStorage.setItem(SESSION_ONLY_KEY, "1");
      document.cookie = `${ALIVE_COOKIE}=1; path=/; SameSite=Lax`;
    }
  } catch {}
}

export default function SessionKeepGuard() {
  useEffect(() => {
    let sessionOnly = false;
    try { sessionOnly = localStorage.getItem(SESSION_ONLY_KEY) === "1"; } catch {}
    if (!sessionOnly) return;
    const alive = document.cookie.split(";").some((c) => c.trim().startsWith(`${ALIVE_COOKIE}=`));
    if (alive) return;
    try { localStorage.removeItem(SESSION_ONLY_KEY); } catch {}
    supabase.auth.signOut({ scope: "local" }).finally(() => { window.location.reload(); });
  }, []);
  return null;
}
