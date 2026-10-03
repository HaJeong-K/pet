import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/kakao-logout
// 카카오 계정 로그아웃 페이지로 보냅니다. 카카오 로그아웃 주소에는 REST API 키(client_id)가
// 꼭 들어가야 해서, 예전엔 브라우저 코드에 NEXT_PUBLIC_KAKAO_REST_API_KEY로 박혀 있었습니다.
// 이제 키는 서버 환경변수에서만 읽고, 이 주소가 카카오로 넘겨줍니다(사이트 코드에서 키가 빠짐).
export async function GET(req: NextRequest) {
  const key = process.env.KAKAO_REST_API_KEY;
  const origin = req.nextUrl.origin;
  if (!key) return NextResponse.redirect(new URL("/", origin));
  const url = new URL("https://kauth.kakao.com/oauth/logout");
  url.searchParams.set("client_id", key);
  url.searchParams.set("logout_redirect_uri", origin);
  return NextResponse.redirect(url);
}
