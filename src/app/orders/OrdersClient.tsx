"use client";

// 주문·예약 내역 화면 — 위쪽 탭으로 숙소 예약 / 쇼핑 주문을 나눕니다. 로그인하지 않았으면 로그인 안내.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StayFrame from "@/components/lodging/StayFrame";
import PageGuide from "@/components/PageGuide";
import { ORDERS_GUIDE_KEY, ORDERS_GUIDE_STEPS } from "@/lib/pageGuides";
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
    // 아래 여백(--ggk-tabbar-space)과 양옆 레일은 StayFrame이 맡습니다
    <StayFrame>
      <section style={{ background: "linear-gradient(160deg,#1F2A1A 0%,#2F3B28 50%,#4A6339 100%)", color: "white", padding: "26px 24px 28px" }}>
        <h1 className="ggk-logo" style={{ margin: 0, fontSize: "clamp(26px, 4.4vw, 36px)", fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.6px" }}>주문·예약 내역</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.6 }}>결제 내역과 영수증을 보고,<br />취소를 신청하거나 후기를 남길 수 있어요.</p>
      </section>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px clamp(16px, 4vw, 24px) 16px" }}>
        {loggedIn === false && (
          <a href="/login?redirect=/orders" style={{ display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#2F3B28", color: "white", fontSize: 15, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>로그인하고 내역 보기</a>
        )}
        {loggedIn && (
          <>
            <PageGuide storageKey={ORDERS_GUIDE_KEY} steps={ORDERS_GUIDE_STEPS} delayMs={1500} />
            <div role="tablist" data-guide="orders-tabs" style={{ display: "flex", gap: 6, margin: "16px 0 12px" }}>
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => router.replace(`/orders?tab=${t.id}`, { scroll: false })} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: `1px solid ${tab === t.id ? "#2F3B28" : "#E8DFD2"}`, background: tab === t.id ? "#2F3B28" : "white", color: tab === t.id ? "white" : "#5F4D3A", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>
              ))}
            </div>
            <div data-guide="orders-list">{tab === "stay" ? <MyStaysCard showEmpty /> : <MyStoreOrders />}</div>
          </>
        )}
      </div>
    </StayFrame>
  );
}
