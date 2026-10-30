import { NextRequest, NextResponse } from "next/server";
import { syncPaymentFromToss } from "@/lib/server/payments";

// 토스페이먼츠 웹훅(PAYMENT_STATUS_CHANGED) — 개발자센터에 https://주소/api/payments/webhook 을 등록합니다.
// 본문은 믿지 않고 paymentKey만 꺼내 토스에 다시 물어봅니다(누가 가짜로 보내도 상태가 바뀌지 않음). 10초 안에 200을 돌려줘야 합니다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paymentKey = body?.data?.paymentKey;
  if (typeof paymentKey === "string" && paymentKey) await syncPaymentFromToss(paymentKey).catch((e) => console.error("[payments webhook]", e));
  return NextResponse.json({ ok: true });
}
