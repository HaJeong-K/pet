"use client";

// 토스 결제창에서 결제가 실패하면 돌아오는 곳(/pay/fail?code&message&orderId). 돈은 나가지 않았고, 내역에서 다시 결제할 수 있습니다.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import StayFrame from "@/components/lodging/StayFrame";

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
      <a href="/orders" style={{ display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#2F3B28", color: "white", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>주문·예약 내역 보기</a>
    </div>
  );
}

export default function PayFailPage() {
  return (
    // 아래 여백(--ggk-tabbar-space)과 양옆 레일은 StayFrame이 맡습니다
    <StayFrame>
      <div style={{ minHeight: "70dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <Suspense fallback={null}><Fail /></Suspense>
      </div>
    </StayFrame>
  );
}
