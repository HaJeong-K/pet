"use client";

// 관리자 "숙박 예약 → 쇼핑 주문" — 결제·환불 상태를 보고, 자동 환불이 실패한 주문을 다시 시도하고, 신고된 후기를 처리합니다.
// 서버는 /api/admin/store-orders.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";
import { won } from "@/lib/ownerPlans";
import { ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, type OrderType, type ReservationStatus } from "@/lib/storeRules";

type Order = { id: number; place_name: string; customer_name: string; total: number; status: ReservationStatus; order_type: OrderType | null; payment_status: string; cancel_request_status: string; created_at: string };
type Report = { id: number; display_name: string; rating: number; content: string; report_reason: string };
const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px" };
const button: React.CSSProperties = { padding: "7px 11px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", color: "#444", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };

export default function StoreOrdersView() {
  const [data, setData] = useState<{ orders: Order[]; reports: Report[]; settled: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch("/api/admin/store-orders", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { setData(await call()); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setData({ orders: [], reports: [], settled: 0 }); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);
  const act = async (action: string, id: number, done: string) => {
    setMessage(null);
    try { await call({ method: "POST", body: JSON.stringify({ action, id }) }); setMessage({ ok: true, text: done }); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
  };

  if (!data) return <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      <div style={{ ...card, fontSize: 13, color: "#444" }}>이용 완료·노쇼로 가게에 정산할 결제 금액 합계 <b>{won(data.settled)}</b><br /><span style={{ fontSize: 12, color: "#666" }}>쇼핑 수수료를 정하면 가게별 정산 금액을 계산합니다.</span></div>
      {data.reports.map((r) => (
        <div key={r.id} style={{ ...card, background: "#FFF7ED" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#B45309" }}>신고된 후기 · 사유: {r.report_reason}</div>
          <div style={{ fontSize: 13, color: "#333", marginTop: 5, lineHeight: 1.6 }}>{r.display_name} · 별점 {r.rating}<br />{r.content}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => act("hide_review", r.id, "후기를 가렸어요.")} style={button}>가리기</button>
            <button onClick={() => act("keep_review", r.id, "신고를 닫고 후기를 유지해요.")} style={button}>유지</button>
          </div>
        </div>
      ))}
      {data.orders.length === 0 && <div style={{ ...card, textAlign: "center", color: "#666", fontSize: 13 }}>쇼핑 주문이 아직 없어요.</div>}
      {data.orders.map((o) => (
        <div key={o.id} style={{ ...card, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "#444" }}>
          <b style={{ color: "#222", fontSize: 13.5 }}>#{o.id} {o.place_name}</b>
          <span>{ORDER_TYPE_LABEL[o.order_type ?? "pickup"]} · {o.customer_name} · {won(o.total)}</span>
          <span>{STATUS_LABEL[o.status]} · {PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status}{o.cancel_request_status === "open" ? " · 취소 요청 중" : ""}</span>
          <span style={{ marginLeft: "auto", color: "#666" }}>{o.created_at.slice(0, 10)}</span>
          {o.payment_status === "refund_failed" && <button onClick={() => act("retry_refund", o.id, "환불했어요.")} style={{ ...button, color: "#b42318", borderColor: "#f3c7c5" }}>환불 다시 시도</button>}
        </div>
      ))}
    </div>
  );
}
