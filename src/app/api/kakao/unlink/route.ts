import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { deleteAccount, findUserByKakaoId } from "@/lib/server/deleteAccount";
import { notifyAdmin } from "@/lib/server/notify";

// 카카오 "연결 해제 웹훅" 받는 주소: /api/kakao/unlink
// 사용자가 카카오 쪽(카카오톡 설정 > 연결된 서비스 관리)에서 같이가개 연결을 끊으면, 카카오가 이 주소로
// 알려줍니다. 그 사용자의 계정을 탈퇴 처리해서 개인정보가 남지 않게 합니다(카카오 개발자 콘솔 경고 대응).
//
// 카카오 콘솔 설정: 앱 > 웹훅 > 연결 해제 웹훅 URL = https://<도메인>/api/kakao/unlink (GET 또는 POST 모두 지원)
// 확인: 카카오는 요청 헤더에 "Authorization: KakaoAK <앱 어드민 키>"를 붙입니다 — 서버 환경변수
//       KAKAO_ADMIN_KEY와 같을 때만 처리합니다(외부에서 마음대로 남의 계정을 지우지 못하게).

function isFromKakao(req: NextRequest): boolean {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  const auth = req.headers.get("authorization") || "";
  if (!adminKey) return false;
  const expected = Buffer.from(`KakaoAK ${adminKey}`);
  const actual = Buffer.from(auth);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(req: NextRequest, params: URLSearchParams) {
  if (!isFromKakao(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kakaoId = params.get("user_id");
  const referrer = params.get("referrer_type") || ""; // ACCOUNT_DELETE(카카오 탈퇴) | UNLINK_FROM_APPS(연결 끊기) 등
  if (!kakaoId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  try {
    const user = await findUserByKakaoId(kakaoId);
    if (!user) return NextResponse.json({ ok: true, found: false }); // 이미 탈퇴했거나 가입 전 — 카카오에는 정상 응답
    // 카카오 쪽은 이미 끊겼으니 카카오에 다시 연결 해제 요청은 하지 않습니다.
    const result = await deleteAccount(user.id, { unlinkKakao: false });
    await notifyAdmin({ title: "👋 카카오 연결 해제로 회원 탈퇴 처리", lines: [`사유: ${referrer || "알 수 없음"}`] });
    return NextResponse.json({ ok: true, found: true, ...result });
  } catch (e) {
    console.error("[kakao/unlink] 처리 실패:", e instanceof Error ? e.message : e);
    // 500을 주면 카카오가 다시 보내 줘서, 일시적 오류여도 결국 처리됩니다.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const params = contentType.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  // 쿼리스트링으로 오는 경우도 함께 받습니다.
  req.nextUrl.searchParams.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  return handle(req, params);
}
