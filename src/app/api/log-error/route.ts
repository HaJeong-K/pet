import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// client_errors insert 전용 — analytics_events(track/route.ts)와 동일하게 RLS를
// 신경 쓸 필요 없이 service role로 씁니다. 로그 적재 실패가 실사용자 화면에 영향을
// 주면 안 되므로 실패해도 항상 200을 반환합니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, stack, source, path, userAgent, authUserId } = body || {};
    if (!message) return NextResponse.json({ ok: false }, { status: 200 });

    // 서버 콘솔(호스팅 로그)에도 남겨서, DB 테이블이 아직 없어도(마이그레이션 전) 최소한
    // 로그로는 확인할 수 있게 합니다.
    console.error(`[client_errors] ${source || "unknown"} ${path || ""}: ${message}`);

    await supabaseAdmin.from("client_errors").insert([
      {
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        source: source || null,
        path: path || null,
        user_agent: userAgent || null,
        auth_user_id: authUserId || null,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/log-error] failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
