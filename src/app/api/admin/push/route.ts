import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { isPushConfigured } from "@/lib/server/shelterPush";
import { addAdminPushSub, listAdminPushSubs, removeAdminPushSub, sendAdminPush } from "@/lib/server/adminPush";

// 관리자 전용: 관리자 폰(브라우저) 알림 기기 관리
//   GET                       → 등록된 기기 목록(알림 주소는 내려주지 않고 끝자리만)
//   POST   { subscription, label } → 이 기기 등록 + 시험 알림 1건
//   POST   { test: true, endpoint } → 이 기기로 시험 알림만
//   DELETE { endpoint }       → 이 기기 해제

const tail = (endpoint: string) => endpoint.slice(-12);

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const subs = await listAdminPushSubs();
  return NextResponse.json({
    configured: isPushConfigured(),
    devices: subs.map((s) => ({ id: tail(s.endpoint), label: s.label, addedAt: s.addedAt })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "알림 발송 설정이 아직 안 돼 있어요." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    label?: string;
    test?: boolean;
    endpoint?: string;
  };

  if (body.test && body.endpoint) {
    const sent = await sendAdminPush({ title: "🔔 같이가개 관리자 알림 시험", body: "이 기기로 알림이 잘 와요.", path: "/admin" }, body.endpoint);
    return NextResponse.json({ ok: sent > 0, sent });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 300 || auth.length > 100) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  }
  try {
    await addAdminPushSub({ endpoint, p256dh, auth, adminId: user.id, label: String(body.label || "기기").slice(0, 40) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "기기를 저장하지 못했어요." }, { status: 500 });
  }
  const sent = await sendAdminPush({ title: "🔔 관리자 알림이 켜졌어요", body: "새 제보·신고·글 검토와 새벽 작업 결과를 이 기기로 알려드릴게요.", path: "/admin" }, endpoint);
  return NextResponse.json({ ok: true, welcomed: sent > 0 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await removeAdminPushSub(endpoint);
  return NextResponse.json({ ok: true });
}
