"use client";

// 관리자 "숙박 예약 → 쇼핑 입점" — 사장님의 입점 상담 신청을 보고 상담 중·승인·반려로 처리합니다.
// 승인하면 그 가게가 쇼핑 탭과 장소 상세에 열립니다. 서버는 /api/admin/store-partners.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";
import { ORDER_TYPE_LABEL, type OrderType } from "@/lib/storeRules";

type Partner = {
  id: number; status: "pending" | "consulting" | "approved" | "rejected"; place_name: string; place_address: string | null; place_phone: string | null;
  requested_place_id: number | null; order_modes: OrderType[]; message: string | null; admin_note: string | null; created_at: string;
  owner: { email: string | null; owner_status: string | null; owner_business_name: string | null } | null;
};
const STATUS = {
  pending: { label: "새 신청", bg: "#FEF3C7", color: "#92400E" },
  consulting: { label: "상담 중", bg: "#DBEAFE", color: "#1D4ED8" },
  approved: { label: "입점", bg: "#DCFCE7", color: "#15803D" },
  rejected: { label: "반려", bg: "#FEE2E2", color: "#B91C1C" },
};
const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px" };
const btn = (kind: "primary" | "plain" | "danger", disabled: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2e4e8"}`,
  background: disabled ? "#d6d3c9" : kind === "primary" ? "#5C7A4A" : "white", color: disabled ? "#4f4a3f" : kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#444",
});

export default function StorePartnersView() {
  const [rows, setRows] = useState<Partner[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch("/api/admin/store-partners", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { const json = await call(); setRows(json.partners ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setRows([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const act = async (id: number, action: string, done: string) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await call({ method: "POST", body: JSON.stringify({ id, action, note: notes[id] ?? "" }) }); setMessage({ ok: true, text: done }); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };

  if (rows === null) return <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {rows.length === 0 && <div style={{ ...card, textAlign: "center", color: "#666", fontSize: 13 }}>입점 상담 신청이 아직 없어요.</div>}
      {rows.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: STATUS[r.status].bg, color: STATUS[r.status].color }}>{STATUS[r.status].label}</span>
            <b style={{ fontSize: 14, color: "#222" }}>{r.place_name}</b>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#666" }}>{r.created_at.slice(0, 10)} 신청</span>
          </div>
          <div style={{ marginTop: 7, fontSize: 12.5, color: "#444", lineHeight: 1.7 }}>
            {r.place_address && <div>{r.place_address}</div>}
            <div>연락처 {r.place_phone ?? "-"} · {r.owner?.email ?? "계정 없음"} · 사장님 {r.owner?.owner_status === "verified" ? "인증 완료" : "인증 대기"}</div>
            <div>받을 방식: {r.order_modes.map((m) => ORDER_TYPE_LABEL[m]).join(" · ")}</div>
            {r.message && <div>문의: {r.message}</div>}
            {r.requested_place_id == null && <div style={{ color: "#B45309" }}>지도에 연결된 가게가 없어요. 승인 전에 장소를 연결해 주세요.</div>}
          </div>
          {r.status !== "approved" && (
            <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
              <input value={notes[r.id] ?? r.admin_note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="메모(반려할 때는 사유 — 사장님에게 보여요)" aria-label={`${r.place_name} 메모`} style={{ padding: "9px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 13, fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.status === "pending" && <button onClick={() => act(r.id, "consulting", "상담 중으로 바꿨어요.")} disabled={busy} style={btn("plain", busy)}>상담 시작</button>}
                <button onClick={() => act(r.id, "approve", "입점을 승인했어요. 상품을 올리면 쇼핑 탭에 보여요.")} disabled={busy} style={btn("primary", busy)}>입점 승인</button>
                <button onClick={() => act(r.id, "reject", "반려했어요.")} disabled={busy} style={btn("danger", busy)}>반려</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
