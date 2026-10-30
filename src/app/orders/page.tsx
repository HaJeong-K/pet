import type { Metadata } from "next";
import { Suspense } from "react";
import OrdersClient from "./OrdersClient";

// 주문·예약 내역(/orders?tab=stay|store) — 손님이 결제한 숙소 예약과 쇼핑 주문을 한곳에서 봅니다.

export const metadata: Metadata = { title: "주문·예약 내역 | 같이가개", robots: { index: false } };

export default function OrdersPage() {
  return <Suspense fallback={null}><OrdersClient /></Suspense>;
}
