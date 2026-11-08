// /api/auth/email-check — 가입·비밀번호 찾기 화면의 "이 이메일이 가입돼 있나" 확인(2026-11-08)
// 예전에는 화면이 DB 함수(check_email_exists)를 바로 불러서 누구나 이메일을 무한히 훑어볼 수 있었습니다.
// 이제 서버에서만 부르고, 같은 곳에서 너무 자주 물으면 잠시 막습니다.
// DB 함수 실행 권한은 scripts/sql/lock-open-tables.sql에서 화면(anon·회원)으로부터 거둡니다.
//   POST { email } → { kind: "none" | "email" | "kakao" }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

const allow = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 254) : "";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "이메일 주소를 다시 확인해 주세요." }, { status: 400 });

  const { data, error } = await db.rpc("check_email_exists", { p_email: email });
  if (error) return NextResponse.json({ error: "지금은 확인할 수 없어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  const kind = data === "kakao" || data === "email" ? data : "none";
  return NextResponse.json({ kind });
}
