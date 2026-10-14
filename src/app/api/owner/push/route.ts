import { NextRequest, NextResponse } from "next/server";
import { ownerContext } from "@/lib/server/ownerStore";
import { isPushConfigured } from "@/lib/server/shelterPush";
import { addOwnerDevice, listOwnerDevices, ORDER_TAG_PREFIX, removeOwnerDevice, sendOwnerPush } from "@/lib/server/ownerPush";

// 사장님의 "새 예약 알림" 기기 관리(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET                              → 알림을 켠 기기 목록(알림 주소는 내려주지 않고 끝자리만)
//   POST   { subscription, label }   → 이 기기 등록 + 시험 알림 1건
//   POST   { test: true, endpoint }  → 이 기기로 시험 알림만
//   DELETE { endpoint }              → 이 기기 해제

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const TEST_ALERT = { title: "멍멍! 새 예약 알림 시험", body: "새 예약이 들어오면 이렇게 알려 드려요." };

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { ready, devices } = await listOwnerDevices(ctx.placeId);
  return NextResponse.json({ ready, configured: isPushConfigured(), devices });
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (!isPushConfigured()) return fail("알림 발송 설정이 아직 안 돼 있어요.", 503);
  const body = (await req.json().catch(() => ({}))) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    label?: string; test?: boolean; endpoint?: string;
  };

  if (body.test && body.endpoint) {
    const sent = await sendOwnerPush(ctx.placeId, { ...TEST_ALERT, tag: `${ORDER_TAG_PREFIX}-test-${Date.now()}` }, body.endpoint);
    return NextResponse.json({ ok: sent > 0 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 300 || auth.length > 100) {
    return fail("구독 정보가 올바르지 않아요.", 400);
  }
  const problem = await addOwnerDevice({ endpoint, p256dh, auth, userId: ctx.userId, placeId: ctx.placeId, label: String(body.label || "기기").slice(0, 40) });
  if (problem) return fail(problem, 400);
  const sent = await sendOwnerPush(ctx.placeId, { ...TEST_ALERT, title: "멍멍! 새 예약 알림이 켜졌어요", tag: `${ORDER_TAG_PREFIX}-test-${Date.now()}` }, endpoint);
  return NextResponse.json({ ok: true, welcomed: sent > 0 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return fail("endpoint required", 400);
  await removeOwnerDevice(ctx.placeId, endpoint);
  return NextResponse.json({ ok: true });
}
