import { NextRequest, NextResponse } from "next/server";
import { connectKakaoTalk, sendKakaoTalkMemo, verifyState } from "@/lib/server/kakaoTalk";

// GET /api/admin/kakao-talk/callback?code=...&state=...
// 카카오 동의 화면에서 돌아오는 주소. state(관리자가 10분 안에 요청한 것인지 서명 확인)가 맞을 때만
// 토큰을 받아 보관하고, 연결 확인 메시지를 보낸 뒤 관리자 대시보드로 돌려보냅니다.
// ⚠ 카카오 개발자 콘솔 > 카카오 로그인 > Redirect URI에 이 주소가 등록돼 있어야 합니다.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (result: string) => NextResponse.redirect(new URL(`/admin?kakaoTalk=${encodeURIComponent(result)}`, origin));

  const error = req.nextUrl.searchParams.get("error");
  if (error) return back(error === "access_denied" ? "denied" : "error");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "";
  if (!code || !verifyState(state)) return back("invalid");

  try {
    await connectKakaoTalk(code, origin);
    await sendKakaoTalkMemo("✅ 같이가개 카카오톡 알림이 연결됐어요.\n앞으로 운영 알림이 이 채팅으로 와요.");
    return back("connected");
  } catch (e) {
    console.error("[kakao-talk/callback]", e instanceof Error ? e.message : e);
    return back(e instanceof Error && e.message.includes("KOE010") ? "secret" : "error");
  }
}
