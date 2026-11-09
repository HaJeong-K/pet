"use client";

// 앱에서 "뒤로 가기 두 번 누르면 종료" — 2026-11-09
// 다른 앱들처럼, 아래 탭 첫 화면(지도·숙소·쇼핑·커뮤니티·입양·마이페이지)에서 뒤로 가기를 누르면
// 이전 화면들을 거슬러 가지 않고 "한 번 더 누르면 종료돼요"를 띄우고, 2초 안에 한 번 더 누르면 앱이 닫힙니다.
//
// 어떻게: 첫 화면 위에 같은 주소의 "지킴이" 기록을 한 칸 올려 둡니다(history.pushState).
//   · 뒤로 가기 1번 → 지킴이 칸이 빠지며 바로 아래 칸으로 → 화면은 그대로 두고 안내만 띄움
//   · 2초 안에 또 → 더 내려갈 기록이 없어 안드로이드 앱이 닫힘
//   · 2초가 지나면 지킴이 칸을 다시 올림
//   ⚠ 아래 칸 밑에 예전 기록이 더 남아 있으면 두 번째 뒤로 가기가 이전 화면으로 가 버립니다(2026-11-09 실제 발생).
//     그래서 첫 번째 뒤로 가기 때 이 페이지 안에서 쌓인 기록의 맨 처음 칸까지 한 번에 내려가 그 칸을
//     지금 화면으로 바꿔 둡니다 → 두 번째 뒤로 가기 때 더 내려갈 곳이 없어 앱이 닫힙니다. 지나온 기록도 이때 모두 정리됩니다.
// 아래 탭은 앱·휴대폰에서 기록을 쌓지 않고 바꿔 끼우므로(TabBar — router.replace) 탭을 오가도 기록이 늘지 않습니다.
// 상세 화면(장소·글 등)에서는 뒤로 가기가 원래대로 이전 화면으로 갑니다.
// 설치한 앱에서만 동작합니다(일반 브라우저에서는 뒤로 가기를 막지 않음 — src/lib/appMode.ts).

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isAppMode, isRootTabPath } from "@/lib/appMode";

const EXIT_WINDOW_MS = 2000;
const FLAG = "__ggkGuard";

type HistState = Record<string, unknown> | null;

export default function BackExitGuard() {
  const pathname = usePathname();
  const [toast, setToast] = useState(false);
  const enabled = useRef(false);
  const inGuardSlot = useRef(false); // 지금 칸이 지킴이 칸인지
  const lastLength = useRef(0);
  const armedTimer = useRef<number | null>(null);
  const viaPop = useRef(false);
  const jumpingToFirst = useRef(false); // 맨 처음 칸으로 내려가는 중

  const pushGuard = () => {
    const st = (window.history.state as HistState) ?? {};
    window.history.pushState({ ...st, [FLAG]: 1 }, "", window.location.href);
    inGuardSlot.current = true;
    lastLength.current = window.history.length;
  };

  // 뒤로 가기 처리 — Next.js 라우터보다 먼저 받도록 capture로 등록합니다.
  useEffect(() => {
    if (!isAppMode()) return;
    enabled.current = true;
    lastLength.current = window.history.length;

    const cleanSaved = () => {
      const saved = guardedState.current;
      const clean: Record<string, unknown> = { ...(saved ?? {}) };
      delete clean[FLAG];
      return clean;
    };

    const onPop = (e: PopStateEvent) => {
      const path = window.location.pathname;
      if (jumpingToFirst.current) {
        // 맨 처음 칸에 도착 — 라우터가 그 칸의 옛 화면으로 이동하지 않게 막고, 지금 화면으로 바꿔 둡니다.
        e.stopImmediatePropagation();
        jumpingToFirst.current = false;
        window.history.replaceState(cleanSaved(), "", guardedUrl.current ?? window.location.href);
        return;
      }
      if (inGuardSlot.current && guardedPath.current && isRootTabPath(guardedPath.current)) {
        // 지킴이 칸이 빠졌습니다 → 화면은 그대로 두고(라우터가 이동하지 않게) 안내를 띄웁니다.
        e.stopImmediatePropagation();
        inGuardSlot.current = false;
        window.history.replaceState(cleanSaved(), "", guardedUrl.current ?? window.location.href);
        // 이 칸 밑에 기록이 더 있으면 맨 처음 칸으로 한 번에 내려갑니다(크롬 Navigation API — 안드로이드 앱은 크롬으로 동작).
        // 같은 페이지 안에서 쌓인 기록까지만 내려갑니다 — 새로 불러온 페이지(로그인 이동·새로고침 등)의 기록으로 넘어가면
        // 그 페이지를 다시 불러오게 되므로 그 앞에서 멈춥니다.
        type NavEntry = { index: number; sameDocument: boolean };
        const nav = (window as unknown as { navigation?: { currentEntry?: NavEntry; entries?: () => NavEntry[] } }).navigation;
        const cur = nav?.currentEntry;
        if (cur && nav?.entries && cur.index > 0) {
          const list = nav.entries();
          let first = cur.index;
          while (first > 0 && list[first - 1]?.sameDocument) first--;
          if (first < cur.index) {
            jumpingToFirst.current = true;
            window.history.go(first - cur.index);
          }
        }
        setToast(true);
        if (armedTimer.current) window.clearTimeout(armedTimer.current);
        armedTimer.current = window.setTimeout(() => {
          setToast(false);
          // 2초 안에 다시 누르지 않았으면 지킴이 칸을 다시 올립니다.
          if (!inGuardSlot.current && isRootTabPath(window.location.pathname)) pushGuard();
        }, EXIT_WINDOW_MS);
        return;
      }
      const st = window.history.state as HistState;
      inGuardSlot.current = !!st?.[FLAG];
      viaPop.current = true;
      lastLength.current = window.history.length;
      // 다른 화면에서 첫 화면으로 돌아왔는데 지킴이 칸이 아니면, 이동이 끝난 뒤 지킴이 칸을 올립니다.
      if (!inGuardSlot.current && isRootTabPath(path)) {
        window.setTimeout(() => {
          if (!inGuardSlot.current && isRootTabPath(window.location.pathname)) pushGuard();
        }, 0);
      }
    };
    window.addEventListener("popstate", onPop, true);
    return () => {
      window.removeEventListener("popstate", onPop, true);
      if (armedTimer.current) window.clearTimeout(armedTimer.current);
    };
  }, []);

  // 지킴이 칸의 주소·상태(뒤로 가기 때 아래 칸을 이 화면으로 맞추는 데 씀)
  const guardedPath = useRef<string | null>(null);
  const guardedUrl = useRef<string | null>(null);
  const guardedState = useRef<HistState>(null);

  // 화면이 바뀔 때마다: 앞으로 쌓였는지(push) / 바꿔 끼웠는지(replace) 보고 지킴이 칸을 맞춥니다.
  useEffect(() => {
    if (!enabled.current) return;
    const len = window.history.length;
    const pushed = len > lastLength.current;
    lastLength.current = len;
    const fromPop = viaPop.current;
    viaPop.current = false;
    if (pushed && !fromPop) inGuardSlot.current = false;

    if (isRootTabPath(pathname)) {
      if (inGuardSlot.current) {
        // 탭을 바꿔 끼우면 라우터가 상태를 새로 써서 표시가 지워지므로 다시 붙입니다.
        const st = (window.history.state as HistState) ?? {};
        if (!st[FLAG]) window.history.replaceState({ ...st, [FLAG]: 1 }, "", window.location.href);
      } else if (!fromPop) {
        pushGuard();
      }
      guardedPath.current = pathname;
      guardedUrl.current = window.location.href;
      guardedState.current = window.history.state as HistState;
    } else {
      guardedPath.current = null;
    }
  }, [pathname]);

  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: "50%", bottom: "calc(110px + env(safe-area-inset-bottom))", transform: "translateX(-50%)",
        zIndex: 10100, padding: "10px 16px", borderRadius: 999, background: "rgba(42,28,20,0.92)", color: "white",
        fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 6px 18px rgba(0,0,0,0.2)", pointerEvents: "none",
      }}
    >
      뒤로 버튼을 한 번 더 누르면 종료돼요
    </div>
  );
}
