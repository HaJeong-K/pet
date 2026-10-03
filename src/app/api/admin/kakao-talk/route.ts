import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import {
  disconnectKakaoTalk, kakaoTalkAuthorizeUrl, kakaoTalkStatus, sendKakaoTalkMemo, signState,
} from "@/lib/server/kakaoTalk";

// 카카오톡 관리자 알림 연결 관리(관리자 전용)
//   GET  → 연결 상태
//   POST { action: "connect" }    → 카카오 동의 화면 주소
//   POST { action: "test" }       → 시험 메시지 보내기
//   POST { action: "disconnect" } → 연결 해제(보관한 토큰 삭제)

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  return NextResponse.json(await kakaoTalkStatus());
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  if (action === "connect") {
    const url = kakaoTalkAuthorizeUrl(req.nextUrl.origin, signState(adminUser.id));
    if (!url) return NextResponse.json({ error: "서버 설정(KAKAO_REST_API_KEY, APP_ENCRYPTION_KEY)이 없어요." }, { status: 500 });
    return NextResponse.json({ url });
  }
  if (action === "test") {
    const ok = await sendKakaoTalkMemo("🐾 같이가개 관리자 알림 시험 메시지예요.\n이제 운영 알림이 이 채팅으로 와요.");
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  }
  if (action === "disconnect") {
    await disconnectKakaoTalk();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action must be connect | test | disconnect" }, { status: 400 });
}
