"use client";

// 토스 결제창에서 결제가 실패하면 돌아오는 곳(/pay/fail?code&message&orderId). 돈은 나가지 않았고, 내역에서 다시 결제할 수 있습니다.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";

function Fail() {
  const params = useSearchParams();
  const message = params.get("message");
  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "28px 22px", borderRadius: 20, background: "white", border: "1px solid #EFE6DA", textAlign: "center", color: "#23201B" }}>
      <CircleAlert size={38} color="#B4412B" style={{ margin: "0 auto" }} />
      <h1 className="ggk-logo" style={{ margin: "12px 0 0", fontSize: 21, fontWeight: 800 }}>결제하지 못했어요</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#5F4D3A", lineHeight: 1.65 }}>
        {message ? <>{message.slice(0, 120)}<br /></> : null}
        돈은 빠져나가지 않았어요.<br />20분 안에 내역에서 다시 결제할 수 있어요.
      </p>
      <a href="/orders" style={{ display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#111111", color: "white", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>주문·예약 내역 보기</a>
    </div>
  );
}

export default function PayFailPage() {
  return (
    <div className="ggk-body" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px calc(var(--ggk-tabbar-space) + 24px)", background: "#FBF7F1", wordBreak: "keep-all" }}>
      <Suspense fallback={null}><Fail /></Suspense>
    </div>
  );
}
