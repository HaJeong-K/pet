"use client";

// 주문·예약 내역 묶음 — 숙소 예약 / 쇼핑 주문을 위쪽 버튼으로 나눠 보여 줍니다.
// 마이페이지 안과 주문·예약 내역 화면(/orders)에서 같은 것을 씁니다.

import { useState } from "react";
import MyStaysCard from "@/components/lodging/MyStaysCard";
import MyStoreOrders from "@/components/MyStoreOrders";

const TABS = [{ id: "stay", label: "숙소 예약" }, { id: "store", label: "쇼핑 주문" }] as const;
export type OrdersTab = (typeof TABS)[number]["id"];

export default function OrdersPanel({ initialTab = "stay", onTab }: { initialTab?: OrdersTab; onTab?: (tab: OrdersTab) => void }) {
  const [tab, setTab] = useState<OrdersTab>(initialTab);
  return (
    <div>
      <div role="tablist" data-guide="orders-tabs" style={{ display: "flex", gap: 6, margin: "0 0 12px" }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); onTab?.(t.id); }} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: `1px solid ${tab === t.id ? "#3B2A20" : "#E1E0DF"}`, background: tab === t.id ? "#3B2A20" : "white", color: tab === t.id ? "white" : "#2A1C14", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>
        ))}
      </div>
      <div data-guide="orders-list">{tab === "stay" ? <MyStaysCard showEmpty /> : <MyStoreOrders />}</div>
    </div>
  );
}
