// 설치한 앱(안드로이드 앱·홈 화면에 추가)으로 열렸는지 — 2026-11-09
// 안드로이드 앱(TWA)은 처음 열 때 referrer가 "android-app://…"이고, 홈 화면 앱은 display-mode가 standalone입니다.
// 처음 화면에서만 알 수 있는 정보라 sessionStorage에 기억해 둡니다.

const KEY = "ggk-app-mode";

export function isAppMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
  } catch { /* 저장소를 못 쓰는 경우 */ }
  const app =
    document.referrer.startsWith("android-app://") ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (app) {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* 무시 */ }
  }
  return !!app;
}

/** 휴대폰 화면이거나 앱으로 열렸는지 — 아래 탭을 누를 때 방문 기록을 쌓지 않을지 정할 때 씁니다 */
export function isMobileLike(): boolean {
  if (typeof window === "undefined") return false;
  return isAppMode() || window.matchMedia?.("(max-width: 767px)").matches;
}

/** 아래 탭의 첫 화면들 — 여기서 뒤로 가기를 누르면 "한 번 더 누르면 종료" 안내를 띄웁니다(앱에서만) */
export const ROOT_TAB_PATHS = ["/", "/stay", "/shop", "/community", "/shelter-notices", "/mypage", "/admin", "/owner"];
export const isRootTabPath = (pathname: string) => ROOT_TAB_PATHS.includes(pathname);
