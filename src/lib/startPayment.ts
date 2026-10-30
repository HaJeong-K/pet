// src/lib/startPayment.ts
//
// 결제창 열기(브라우저) — 예약·주문 번호를 주면 서버에서 금액을 받아 토스 결제창으로 넘어갑니다. 끝나면 /pay/success 또는 /pay/fail로 돌아옵니다.

import { supabase } from "@/lib/supabase";
import type { PaymentKind } from "@/lib/payments";

type TossSdk = (clientKey: string) => {
  payment: (o: { customerKey: string }) => {
    requestPayment: (o: Record<string, unknown>) => Promise<void>;
  };
};

function loadSdk(): Promise<TossSdk> {
  const w = window as unknown as { TossPayments?: TossSdk };
  if (w.TossPayments) return Promise.resolve(w.TossPayments);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v2/standard";
    s.onload = () => (w.TossPayments ? resolve(w.TossPayments) : reject(new Error("결제창을 불러오지 못했어요.")));
    s.onerror = () => reject(new Error("결제창을 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
    document.head.appendChild(s);
  });
}

/** 결제창으로 넘어갑니다. 손님이 창을 닫으면 조용히 돌아오고, 그 밖의 문제는 오류를 던집니다. */
export async function startPayment(kind: PaymentKind, id: number): Promise<void> {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) throw new Error("카드 결제를 준비하고 있어요.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/payments/prepare", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ kind, id }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "결제를 시작하지 못했어요.");
  const TossPayments = await loadSdk();
  try {
    await TossPayments(clientKey).payment({ customerKey: session.user.id }).requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: json.amount },
      orderId: json.orderId,
      orderName: json.orderName,
      successUrl: `${window.location.origin}/pay/success`,
      failUrl: `${window.location.origin}/pay/fail`,
      customerEmail: session.user.email ?? undefined,
      card: { useEscrow: false, flowMode: "DEFAULT", useCardPoint: false, useAppCardOnly: false },
    });
  } catch (e) {
    // 손님이 결제창을 닫은 경우 — 내역에서 이어서 결제할 수 있습니다
    if ((e as { code?: string })?.code === "USER_CANCEL") return;
    throw e instanceof Error ? e : new Error("결제를 시작하지 못했어요.");
  }
}
