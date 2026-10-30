"use client";

// 토스 결제창이 돌아오는 곳(/pay/success?paymentKey&orderId&amount) — 서버에 승인을 요청하고 결과를 보여 줍니다.
// 이 승인까지 끝나야 실제 결제가 이뤄집니다.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";

const box: React.CSSProperties = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px calc(var(--ggk-tabbar-space) + 24px)", background: "#FBF7F1", wordBreak: "keep-all" };
const card: React.CSSProperties = { width: "100%", maxWidth: 420, padding: "28px 22px", borderRadius: 20, background: "white", border: "1px solid #EFE6DA", textAlign: "center", color: "#23201B" };
const link: React.CSSProperties = { display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#111111", color: "white", fontSize: 15, fontWeight: 800, textDecoration: "none" };

function Confirm() {
  const params = useSearchParams();
  const started = useRef(false);
  const [state, setState] = useState<{ ok: boolean; text: string; tab: string } | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const orderId = params.get("orderId") ?? "";
      const tab = orderId.startsWith("ggk-l") ? "stay" : "store";
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("로그인이 풀렸어요. 다시 로그인한 뒤 내역에서 결제해 주세요.");
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ paymentKey: params.get("paymentKey"), orderId, amount: Number(params.get("amount")) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "결제를 완료하지 못했어요.");
        setState({ ok: true, text: "사장님이 확인하면 알림으로 알려 드려요.", tab });
      } catch (e) {
        setState({ ok: false, text: e instanceof Error ? e.message : "결제를 완료하지 못했어요.", tab });
      }
    })();
  }, [params]);

  if (!state) return <div style={card}><LogoLoader /><div style={{ marginTop: 12, fontSize: 14, color: "#5F4D3A" }}>결제를 확인하고 있어요</div></div>;
  return (
    <div style={card}>
      {state.ok ? <CheckCircle2 size={38} color="#15803D" style={{ margin: "0 auto" }} /> : <CircleAlert size={38} color="#B4412B" style={{ margin: "0 auto" }} />}
      <h1 className="ggk-logo" style={{ margin: "12px 0 0", fontSize: 21, fontWeight: 800 }}>{state.ok ? "결제가 완료됐어요" : "결제가 완료되지 않았어요"}</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#5F4D3A", lineHeight: 1.65 }}>{state.text}</p>
      <a href={`/orders?tab=${state.tab}`} style={link}>주문·예약 내역 보기</a>
    </div>
  );
}

export default function PaySuccessPage() {
  return <div className="ggk-body" style={box}><Suspense fallback={null}><Confirm /></Suspense></div>;
}
