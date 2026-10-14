// src/lib/premiumPeriod.ts
//
// 관리자가 프리미엄 이용 기간을 "며칠 늘리기 / 줄이기"로 조절할 때의 계산(관리자 화면과 서버가 같이 씁니다).
//   · 늘릴 때: 아직 남은 기간이 있으면 만료일에서 이어서, 이미 끝났으면 지금부터 셉니다.
//   · 줄일 때: 만료일에서 뺍니다. 뺀 결과가 지금보다 이르면 바로 종료로 처리합니다.

const DAY_MS = 24 * 60 * 60 * 1000;
/** 한 번에 조절할 수 있는 최대 일수(실수로 큰 숫자를 넣는 것 방지) */
export const PREMIUM_ADJUST_DAYS_MAX = 365;

export function adjustExpiry(
  currentExpiresAt: string | null | undefined,
  days: number,
  now = Date.now(),
): { expiresAt: string; ended: boolean } | { error: string } {
  if (!Number.isFinite(days) || !Number.isInteger(days) || days === 0) return { error: "늘리거나 줄일 날짜 수를 1 이상의 숫자로 적어 주세요." };
  if (Math.abs(days) > PREMIUM_ADJUST_DAYS_MAX) return { error: `한 번에 ${PREMIUM_ADJUST_DAYS_MAX}일까지만 조절할 수 있어요.` };
  const current = currentExpiresAt ? new Date(currentExpiresAt).getTime() : 0;
  if (days < 0 && !(current > now)) return { error: "이미 끝난 프리미엄은 더 줄일 수 없어요." };
  const next = (days > 0 ? Math.max(current, now) : current) + days * DAY_MS;
  if (next <= now) return { expiresAt: new Date(now).toISOString(), ended: true };
  return { expiresAt: new Date(next).toISOString(), ended: false };
}
