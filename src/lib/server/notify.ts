// src/lib/server/notify.ts
//
// 관리자 알림(서버 전용). 새 사장님 신청·제보·프리미엄 신청, 자동 작업 실패, 매일 아침 처리 대기 요약을
// 메신저로 보냅니다. 관리자 화면에 들어가 보지 않아도 바로 알 수 있게 하기 위함입니다.
//
// 설정(하나 이상 — 없으면 알림만 조용히 건너뜀)
//   카카오톡: 관리자 대시보드에서 "카카오톡 알림 연결"(나에게 보내기, src/lib/server/kakaoTalk.ts)
//   ADMIN_ALERT_WEBHOOK_URL  디스코드 또는 슬랙 웹훅 주소(주소 모양으로 자동 구분)
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  텔레그램 봇
//
// 알림 실패가 사용자 요청을 막으면 안 되므로 절대 예외를 던지지 않고, 3초 안에 끝냅니다.
import { siteUrl } from "@/lib/siteUrl";
import { sendKakaoTalkMemo } from "@/lib/server/kakaoTalk";

const TIMEOUT_MS = 3000;
const SKIP = Symbol("skip");
const MAX_LEN = 1800;

export type AdminAlert = {
  /** 한 줄 제목(앞에 이모지 권장) */
  title: string;
  /** 본문 줄들 */
  lines?: (string | null | undefined | false)[];
  /** 관리자 화면 경로(예: "/admin/owners") — 사이트 주소를 붙여 링크로 보냅니다 */
  path?: string;
};

function render(alert: AdminAlert): string {
  const body = (alert.lines || []).filter(Boolean).map((l) => `• ${l}`);
  const link = alert.path ? `${siteUrl}${alert.path}` : null;
  const text = [alert.title, ...body, link].filter(Boolean).join("\n");
  return text.length > MAX_LEN ? text.slice(0, MAX_LEN - 1) + "…" : text;
}

async function post(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 설정된 알림 채널이 하나라도 있는지 */
export function isAlertConfigured(): boolean {
  return Boolean(process.env.ADMIN_ALERT_WEBHOOK_URL || (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID));
}

/** 관리자에게 알림을 보냅니다. 보낸 채널 수를 돌려줍니다(설정이 없으면 0). */
export async function notifyAdmin(alert: AdminAlert): Promise<number> {
  const text = render(alert);
  const jobs: Promise<boolean | typeof SKIP>[] = [];

  const webhook = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (webhook) {
    // 디스코드는 { content }, 슬랙(및 대부분의 웹훅)은 { text } 형식을 받습니다.
    const isDiscord = /discord(app)?\.com\/api\/webhooks\//.test(webhook);
    jobs.push(post(webhook, isDiscord ? { content: text } : { text }));
  }

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    jobs.push(post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      chat_id: tgChat,
      text,
      disable_web_page_preview: true,
    }));
  }

  // 카카오톡(연결돼 있을 때만) — 본문이 200자로 잘리므로 주소 줄은 빼고, 링크 버튼으로 관리자 화면을 엽니다.
  // 연결 안 된 상태(null)는 실패로 세지 않습니다.
  const linkLine = alert.path ? `\n${siteUrl}${alert.path}` : "";
  jobs.push(sendKakaoTalkMemo(linkLine ? text.replace(linkLine, "") : text, alert.path ?? "/admin").then((r) => r ?? SKIP));

  const results = (await Promise.all(jobs)).filter((r) => r !== SKIP) as boolean[];
  if (results.length === 0) return 0;
  const sent = results.filter(Boolean).length;
  if (sent < results.length) console.warn(`[notify] 알림 일부 전송 실패 (${sent}/${results.length})`);
  return sent;
}
