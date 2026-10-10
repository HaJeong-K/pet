import { NextRequest, NextResponse } from "next/server";

// GET /api/og — 사이트 기본 공유 그림(홈·커뮤니티 등 장소가 아닌 화면을 공유했을 때)
// 예전에는 서버가 요청 때마다 카드를 그렸는데, 이제는 미리 만들어 둔 그림(public/og-default.png —
// 핀 로고와 "같이 갈 수 있는 곳, 지도에서 한눈에", 지도 한 조각)을 씁니다. 이 주소를 이미 기억하고 있는
// 곳(메신저·검색엔진의 미리보기)을 위해 새 그림으로 넘겨줍니다.
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/og-default.png", req.url), 308);
}
