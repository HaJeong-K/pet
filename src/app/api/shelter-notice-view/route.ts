import { NextRequest, NextResponse } from "next/server";
import { fetchDetailHtml } from "@/lib/shelterNotices";

// GET /api/shelter-notice-view?desertionNo=xxxx
// 카드 클릭 시 새 탭으로 여는 주소입니다. animal.go.kr의 상세페이지는 세션 쿠키가
// 없으면(=사용자의 첫 방문 브라우저) POST가 실패하므로, 세션을 가진 우리 서버가
// 대신 요청해서 실제 공고 원문 HTML을 그대로 내려줍니다.
export async function GET(req: NextRequest) {
  const desertionNo = req.nextUrl.searchParams.get("desertionNo");
  if (!desertionNo) {
    return NextResponse.json({ error: "desertionNo required" }, { status: 400 });
  }

  const html = await fetchDetailHtml(desertionNo);
  if (!html) {
    return NextResponse.json({ error: "공고를 불러오지 못했습니다" }, { status: 502 });
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
