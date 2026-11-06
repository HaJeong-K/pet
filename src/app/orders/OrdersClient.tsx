"use client";

// 주문·예약 내역 화면 — 마이페이지의 일부입니다(아래 탭바도 마이페이지가 켜짐). 로그인하지 않았으면 로그인 안내.

import PageHero from "@/components/PageHero";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StayFrame from "@/components/lodging/StayFrame";
import PageGuide from "@/components/PageGuide";
import { ORDERS_GUIDE_KEY, ORDERS_GUIDE_STEPS } from "@/lib/pageGuides";
import OrdersPanel from "@/components/OrdersPanel";
import { ChevronLeft } from "lucide-react";

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
    <StayFrame wide>
      <PageHero eyebrow="마이페이지" title="주문·예약 내역" desc="결제 내역과 영수증을 보고, 취소를 신청하거나 후기를 남길 수 있어요." />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px clamp(16px, 4vw, 24px) 16px" }}>
        {loggedIn === false && (
          <a href="/login?redirect=/orders" style={{ display: "block", marginTop: 18, padding: 14, borderRadius: 14, background: "#3B2A20", color: "white", fontSize: 15, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>로그인하고 내역 보기</a>
        )}
        {loggedIn && (
          <>
            <PageGuide storageKey={ORDERS_GUIDE_KEY} steps={ORDERS_GUIDE_STEPS} delayMs={1500} />
            <a href="/mypage" style={{ display: "inline-flex", alignItems: "center", gap: 2, margin: "14px 0 10px", color: "#2A1C14", fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}><ChevronLeft size={16} />마이페이지</a>
            <OrdersPanel key={tab} initialTab={tab} onTab={(t) => router.replace(`/orders?tab=${t}`, { scroll: false })} />
          </>
        )}
      </div>
    </StayFrame>
  );
}
