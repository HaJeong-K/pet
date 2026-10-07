// src/lib/server/notify.ts
//
// 관리자 알림(서버 전용). 새 사장님 신청·제보·프리미엄 신청, 폐업 확인, 자동 작업 실패, 매일 아침 처리 대기
// 요약을 관리자 카카오톡 '나와의 채팅'으로 보냅니다(나에게 보내기 — src/lib/server/kakaoTalk.ts).
// 관리자 화면에 들어가 보지 않아도 바로 알 수 있게 하기 위함입니다.
//
// 연결: 관리자 대시보드의 "카카오톡 알림" 카드에서 한 번 연결합니다. 연결 전에는 알림만 조용히 건너뜁니다.
// 알림 실패가 사용자 요청을 막으면 안 되므로 절대 예외를 던지지 않습니다.
import { sendKakaoTalkMemo } from "@/lib/server/kakaoTalk";
import { sendAdminPush } from "@/lib/server/adminPush";

export type AdminAlert = {
  /** 한 줄 제목(앞에 이모지 권장) */
  title: string;
  /** 본문 줄들 */
  lines?: (string | null | undefined | false)[];
  /** 관리자 화면 경로(예: "/admin/owners") — 메시지의 "관리자 화면 열기" 버튼이 여는 곳 */
  path?: string;
};

/** 관리자에게 알림을 보냅니다. 보냈으면 true, 연결 전이거나 실패하면 false. */
export async function notifyAdmin(alert: AdminAlert): Promise<boolean> {
  // 카카오톡 본문은 200자까지라 제목 + 항목만 담고, 자세한 내용은 버튼으로 관리자 화면에서 봅니다.
  const text = [alert.title, ...(alert.lines || []).filter(Boolean).map((l) => `• ${l}`)].join("\n");
  // 카카오톡(기록용)과 앱 알림(푸시)을 함께 보냅니다 — 한쪽이 실패해도 다른 쪽은 갑니다.
  // 앱 알림은 안드로이드 앱(mobile/android)에서 켠 기기로 "같이가개 앱"의 알림으로 뜹니다.
  const [sent, pushed] = await Promise.all([
    sendKakaoTalkMemo(text, alert.path ?? "/admin"),
    sendAdminPush({
      title: alert.title,
      body: (alert.lines || []).filter(Boolean).join("\n"),
      path: alert.path ?? "/admin",
    }),
  ]);
  if (sent === false) console.warn("[notify] 카카오톡 알림 전송 실패");
  return sent === true || pushed > 0;
}
