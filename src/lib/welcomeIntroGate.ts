// 첫 방문 소개(WelcomeIntro)를 띄울지 판단 — 지도 화면이 소개 화면 코드 전체를 미리 받지 않도록 따로 둡니다.
/** 끝까지 봤거나 "다시 보지 않기"를 눌렀는지(기기에 계속 남음). 소개 내용을 크게 바꾸면 끝의 숫자를 올립니다. */
export const INTRO_NEVER_KEY = "ggk_intro_never_v3";
/** 이번 방문에서 이미 봤는지(앱·탭을 닫으면 지워짐) */
export const INTRO_SESSION_KEY = "ggk_intro_seen_v3";

/** 소개를 띄워야 하면 true */
export function shouldShowWelcomeIntro(): boolean {
  try {
    if (localStorage.getItem(INTRO_NEVER_KEY)) return false;
    return !sessionStorage.getItem(INTRO_SESSION_KEY);
  } catch {
    return true; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 그냥 보여 줍니다
  }
}
