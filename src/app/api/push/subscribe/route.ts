import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { isPushConfigured, normalizeRegion, sendWelcomePush } from "@/lib/server/shelterPush";

// 브라우저 알림 구독 관리(유기동물 공고 지역 알림)
//   POST   { subscription, region }  → 구독 등록(같은 브라우저가 다시 켜면 지역만 갱신) + 확인 알림 1건
//   DELETE { endpoint }              → 구독 해제
// 구독 정보는 브라우저가 발급한 것만 받습니다(알림 주소는 https여야 하고, 암호화 키 2개가 있어야 함).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

const tableMissing = (message: string) => /push_subscriptions/.test(message) && /find|exist|schema cache/i.test(message);

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return NextResponse.json({ error: "요청이 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  if (!isPushConfigured()) return NextResponse.json({ error: "알림 발송 설정이 아직 안 돼 있어요." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    region?: string;
  };
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  const region = normalizeRegion(body.region);
  if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 300 || auth.length > 100) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  }
  if (!region) return NextResponse.json({ error: "알림 받을 지역을 골라 주세요." }, { status: 400 });

  // 로그인 사용자면 계정에 연결(탈퇴 시 함께 정리)
  let authUserId: string | null = null;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (token) authUserId = (await supabaseAdmin.auth.getUser(token)).data.user?.id ?? null;

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert([{ endpoint, p256dh, auth, region, auth_user_id: authUserId }], { onConflict: "endpoint" });
  if (error) {
    return NextResponse.json(
      { error: tableMissing(error.message) ? "알림 저장 공간이 아직 준비되지 않았어요(scripts/sql/push-subscriptions.sql 실행 필요)." : "구독 저장에 실패했어요." },
      { status: tableMissing(error.message) ? 503 : 500 }
    );
  }
  const welcomed = await sendWelcomePush({ endpoint, p256dh, auth }, region);
  return NextResponse.json({ ok: true, region, welcomed });
}

export async function DELETE(req: NextRequest) {
  if (!allow(clientIp(req))) return NextResponse.json({ error: "요청이 많아요." }, { status: 429 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
