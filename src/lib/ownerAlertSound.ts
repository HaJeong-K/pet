// src/lib/ownerAlertSound.ts
//
// 사장님 "새 예약" 알림음(멍멍!) — 사이트를 열어 둔 화면에서 재생합니다.
// 소리 파일(public/sounds/bark.wav)은 scripts/make-bark-sound.cjs가 수식으로 합성해 만든 것이라 저작권 문제가 없습니다.
// 켜고 끄는 설정은 기기마다 따로 기억합니다(가게의 PC는 켜고, 개인 폰은 끄는 식으로 쓸 수 있게).

const KEY = "ggk_owner_sound";
export const BARK_SOUND_URL = "/sounds/bark.wav";

export function isOwnerSoundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setOwnerSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* 저장 못 해도 이번 화면에서는 동작 */ }
}

let audio: HTMLAudioElement | null = null;
/**
 * 멍멍 소리를 냅니다. force=true면 설정과 상관없이("소리 들어보기" 버튼).
 * 브라우저는 사용자가 화면을 한 번도 누르지 않은 탭에서는 소리를 막을 수 있습니다 — 그때는 조용히 넘어갑니다.
 */
export function playBark(force = false): Promise<boolean> {
  if (typeof window === "undefined" || (!force && !isOwnerSoundOn())) return Promise.resolve(false);
  try {
    audio ??= new Audio(BARK_SOUND_URL);
    audio.currentTime = 0;
    return audio.play().then(() => true).catch(() => false);
  } catch { return Promise.resolve(false); }
}
