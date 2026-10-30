"use client";

// 관리자 "숙박 예약 → 입점 심사" — 「같이가개 숙소 입점 계약서」 제5조
//   영업신고증(10분 동안만 열리는 주소)·정산 계좌·사장님 정보를 보고 승인/반려합니다.
//   승인하면 고른 숙소가 사장님 숙소로 연결되고, 그날이 입점일(3개월 수수료 5%)이 됩니다.
// 서버는 /api/admin/lodging-partners.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { promoLastDay } from "@/lib/lodgingPolicy";

type Partner = {
  id: number; status: "pending" | "approved" | "rejected"; requested_place_id: number | null; place_name: string; place_address: string | null; place_phone: string | null;
  bank_name: string | null; account_number: string | null; account_holder: string | null; contract_version: string | null; agreed_at: string | null;
  linked_place_id: number | null; partner_since: string | null; admin_note: string | null; created_at: string; licenseUrl: string | null;
  owner: { email: string | null; owner_business_name: string | null; owner_phone: string | null; owner_biz_no: string | null } | null;
};

const STATUS = { pending: { label: "심사 대기", bg: "#FEF3C7", color: "#92400E" }, approved: { label: "승인", bg: "#DCFCE7", color: "#166534" }, rejected: { label: "반려", bg: "#FEE2E2", color: "#991B1B" } };
const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px" };
const btn = (kind: "primary" | "danger", disabled: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : "1px solid #f3c7c5", background: disabled ? "#d6d3c9" : kind === "primary" ? "#5C7A4A" : "white", color: kind === "primary" ? "white" : "#b42318",
});

export default function PartnersView() {
  const [rows, setRows] = useState<Partner[] | null>(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch("/api/admin/lodging-partners", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { const json = await call(); setReady(json.ready !== false); setRows(json.partners ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setRows([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const act = async (p: Partner, action: "approve" | "reject") => {
    const note = notes[p.id]?.trim() ?? "";
    if (action === "reject" && !note) { setMessage({ ok: false, text: "반려 사유를 적어 주세요(사장님에게 보여요)." }); return; }
    const ask = action === "approve"
      ? `${p.place_name} 입점을 승인할까요?\n오늘이 입점일이 되고, ${stayDayLabel(promoLastDay(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)))} 체크인까지 수수료 5%가 적용돼요.`
      : `${p.place_name} 입점 신청을 반려할까요?`;
    if (busy || !window.confirm(ask)) return;
    setBusy(true);
    setMessage(null);
    try { await call({ method: "POST", body: JSON.stringify({ id: p.id, action, note }) }); setMessage({ ok: true, text: action === "approve" ? "승인했어요. 이제 손님이 바로 예약할 수 있어요." : "반려했어요." }); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {!ready && <div style={{ ...card, color: "#9a3412", fontSize: 13 }}>Supabase SQL 편집기에서 <b>scripts/sql/lodging-partners.sql</b>을 실행해 주세요.</div>}
      {rows === null && <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>}
      {rows?.length === 0 && ready && <div style={{ ...card, textAlign: "center", color: "#6e6e6e", fontSize: 13 }}>입점 신청이 없어요.</div>}
      {rows?.map((p) => {
        const st = STATUS[p.status];
        return (
          <div key={p.id} style={{ ...card, borderLeft: `4px solid ${p.status === "pending" ? "#F59E0B" : "#e5e0d0"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
              <b style={{ fontSize: 14 }}>{p.place_name}</b>
              {p.requested_place_id != null
                ? <a href={`/place/${p.requested_place_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1D4F91" }}>지도 숙소 #{p.requested_place_id}</a>
                : <span style={{ fontSize: 12, color: "#B45309", fontWeight: 700 }}>지도에 없는 숙소</span>}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{stayDayLabel(p.created_at.slice(0, 10))} 신청</span>
            </div>
            <div style={{ fontSize: 12.5, color: "#555", marginTop: 6, lineHeight: 1.75 }}>
              {[p.place_address, p.place_phone].filter(Boolean).join(" · ") || "주소·전화 없음"}<br />
              사장님: {p.owner?.owner_business_name ?? "-"} · 사업자 {p.owner?.owner_biz_no ?? "-"} · {p.owner?.owner_phone ?? "-"} · {p.owner?.email ?? "-"}<br />
              정산 계좌: {p.bank_name} {p.account_number} ({p.account_holder})<br />
              계약 동의: {p.contract_version ?? "-"}판{p.agreed_at ? ` · ${stayDayLabel(p.agreed_at.slice(0, 10))}` : ""}
              {p.status === "approved" && p.partner_since && <><br />입점일 {stayDayLabel(p.partner_since)} · 프로모션 {stayDayLabel(promoLastDay(p.partner_since))} 체크인까지 · 연결 장소 #{p.linked_place_id}</>}
              {p.admin_note && <><br />메모: {p.admin_note}</>}
            </div>
            <div style={{ marginTop: 8 }}>
              {p.licenseUrl
                ? <a href={p.licenseUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 800, color: "#1D4F91" }}>영업신고증 보기(10분 동안 열림)</a>
                : <span style={{ fontSize: 12.5, color: "#666" }}>영업신고증 없음</span>}
            </div>
            {p.status === "pending" && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#5c5c5c", lineHeight: 1.6 }}>
                  확인할 것: 영업신고증의 상호·주소가 숙소와 같은지, 예금주가 사업자와 같은지, 반려동물 동반 숙소가 맞는지
                  {p.requested_place_id == null && <><br /><b style={{ color: "#B45309" }}>지도에 없는 숙소는 먼저 제보로 장소를 등록한 뒤, 사장님께 그 장소를 골라 다시 신청해 달라고 안내해 주세요.</b></>}
                </div>
                <textarea value={notes[p.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} rows={2} placeholder="메모 · 반려 사유(사장님에게 보여요)" style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 12.5, boxSizing: "border-box", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button disabled={busy || p.requested_place_id == null} onClick={() => act(p, "approve")} style={btn("primary", busy || p.requested_place_id == null)}>승인 → 예약 열기</button>
                  <button disabled={busy} onClick={() => act(p, "reject")} style={btn("danger", busy)}>반려</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
