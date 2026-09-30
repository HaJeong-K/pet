import { NextRequest, NextResponse } from "next/server";

// GET /api/shelter-notice-view?desertionNo=xxxx
// 예전엔 animal.go.kr 상세페이지 HTML을 서버에서 대신 받아 보여주는 프록시였는데, 그 사이트
// 구조가 바뀌어 502 오류만 났습니다. 이제 공고 상세는 우리 사이트의 /shelter-notices/[desertionNo]
// 화면에서 보여주므로, 예전 주소로 들어온 요청은 그쪽으로 보냅니다.
export async function GET(req: NextRequest) {
  const desertionNo = req.nextUrl.searchParams.get("desertionNo") ?? "";
  const target = /^\d{6,20}$/.test(desertionNo) ? `/shelter-notices/${desertionNo}` : "/shelter-notices";
  return NextResponse.redirect(new URL(target, req.url), 308);
}
