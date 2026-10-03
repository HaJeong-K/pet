// src/lib/server/cronAuth.ts
//
// 자동 작업(크론) 주소 보호. Vercel은 크론을 부를 때 "Authorization: Bearer <CRON_SECRET>"을
// 자동으로 붙입니다. 이 값이 맞을 때만 실행해서, 외부에서 마음대로 불러 공공 API 한도를 쓰거나
// 서버 비용을 늘리지 못하게 합니다.
// 개발 중(로컬)에는 인증 헤더 없이 주소창에서 직접 열어 테스트할 수 있습니다.
import { NextResponse, type NextRequest } from "next/server";

/** 통과하면 null, 막아야 하면 돌려줄 응답 */
export function rejectUnauthorizedCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV !== "production" && !auth) return null;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
