"use client";

// 주문·예약 내역 화면 — 위쪽 탭으로 숙소 예약 / 쇼핑 주문을 나눕니다. 로그인하지 않았으면 로그인 안내.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MyStaysCard from "@/components/lodging/MyStaysCard";
import MyStoreOrders from "@/components/MyStoreOrders";

const TABS = [{ id: "stay", label: "숙소 예약" }, { id: "store", label: "쇼핑 주문" }] as const;

export default function OrdersClient() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "store" ? "store" : "stay";
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session));
  }, []);

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#FBF7F1", color: "#23201B", wordBreak: "keep-all" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px clamp(16px, 4vw, 24px) calc(var(--ggk-tabbar-space) + 16px)" }}>
        <h1 className="ggk-logo" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#4A3021" }}>주문·예약 내역</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#5F4D3A", lineHeight: 1.6 }}>결제 내역과 영수증을 보고, 취소를 신청하거나 후기를 남길 수 있어요.</p>
        {loggedIn === false && (
          <a href="/login?redirect=/orders" style={{ display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#111111", color: "white", fontSize: 15, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>로그인하고 내역 보기</a>
        )}
        {loggedIn && (
          <>
            <div role="tablist" style={{ display: "flex", gap: 6, margin: "16px 0 12px" }}>
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => router.replace(`/orders?tab=${t.id}`, { scroll: false })} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: `1px solid ${tab === t.id ? "#4A3021" : "#E8DFD2"}`, background: tab === t.id ? "#4A3021" : "white", color: tab === t.id ? "white" : "#5F4D3A", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>
              ))}
            </div>
            {tab === "stay" ? <MyStaysCard showEmpty /> : <MyStoreOrders />}
          </>
        )}
      </div>
    </div>
  );
}
