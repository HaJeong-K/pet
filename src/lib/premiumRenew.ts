// 요금제 자동 연장 규칙(글자·숫자만 — 화면·서버·테스트가 같이 씀)
//   · 사장님 센터에서 만료 14일 전부터 "기한이 끝나면 자동으로 연장할까요?" 팝업(아직 정하지 않았을 때)
//   · 매일 새벽: 만료 7일 전까지 안 정했으면 사장님 기기로 한 번 묻고, 자동 연장이면 만료 3일 전에 연장 신청을 넣음
// 표: premium_auto_renew(scripts/sql/premium-auto-renew.sql)

export const RENEW_PROMPT_DAYS = 14;
export const RENEW_REMIND_DAYS = 7;
export const RENEW_FILE_DAYS = 3;
export const RENEW_MONTH_OPTIONS = [1, 3, 6, 12];

const DAY = 86_400_000;
export const daysLeft = (expiresAt: string, now = Date.now()) => Math.ceil((new Date(expiresAt).getTime() - now) / DAY);

/** 사장님 센터에서 팝업을 띄울지 — 이용 중이고, 만료가 14일 안이고, 아직 정하지 않았을 때 */
export function shouldPromptRenew(expiresAt: string | null | undefined, enabled: boolean | null | undefined, now = Date.now()): boolean {
  if (!expiresAt || enabled != null) return false;
  const left = daysLeft(expiresAt, now);
  return left > 0 && left <= RENEW_PROMPT_DAYS;
}

export type RenewRow = { place_id: number; enabled: boolean | null; reminded_for: string | null; renewed_for: string | null };

/** 새벽 작업이 이 가게에 할 일 — 연장 신청 넣기 / 정해 달라고 알리기 / 없음 */
export function renewAction(expiresAt: string | null, row: RenewRow | null, now = Date.now()): "file" | "remind" | null {
  if (!expiresAt) return null;
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return null;
  const expiryDay = expiresAt.slice(0, 10);
  if (row?.enabled === true && left <= RENEW_FILE_DAYS && row.renewed_for !== expiryDay) return "file";
  if ((row?.enabled == null) && left <= RENEW_REMIND_DAYS && row?.reminded_for !== expiryDay) return "remind";
  return null;
}
