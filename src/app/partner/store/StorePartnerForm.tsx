"use client";

// 쇼핑 입점 상담 신청 칸 — 로그인·사장님 여부에 따라 안내하고, 사장님이면 바로 신청합니다.
// ?place=번호 로 들어오면(장소 상세에서) 그 가게 이름을 미리 채웁니다.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ORDER_TYPE_LABEL, type OrderType } from "@/lib/storeRules";

type State = {
  loggedIn: boolean; ready?: boolean; isOwner?: boolean;
  partner?: { status: "pending" | "consulting" | "approved" | "rejected"; place_name: string; place_address: string | null; place_phone: string | null; order_modes: OrderType[]; message: string | null; admin_note: string | null } | null;
  defaults?: { placeName: string; phone: string; placeId: number | null };
};
const STATUS_TEXT = {
  pending: "상담 신청을 받았습니다. 곧 연락드리겠습니다.",
  consulting: "상담을 진행하고 있습니다.",
  approved: "입점이 완료되었습니다. 사장님 센터의 상품 메뉴에서 메뉴를 올리면 쇼핑 탭에 표시됩니다.",
  rejected: "이번에는 입점이 어려웠습니다. 내용을 고쳐 다시 신청할 수 있습니다.",
};
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 12, border: "1px solid #E8DFD2", background: "white", fontSize: 15, fontFamily: "inherit", color: "#23201B" };
const primary: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 14, border: "none", background: "#2F3B28", color: "white", fontSize: 15.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", textDecoration: "none" };

export default function StorePartnerForm() {
  const params = useSearchParams();
  const placeParam = Number(params.get("place"));
  const placeId = Number.isInteger(placeParam) && placeParam > 0 ? placeParam : null;
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState({ placeName: "", address: "", phone: "", message: "" });
  const [modes, setModes] = useState<OrderType[]>(["pickup"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) setState({ loggedIn: false }); return; }
      const res = await fetch("/api/owner/store-partner", { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const json: State | null = res && res.ok ? await res.json().catch(() => null) : null;
      if (cancelled) return;
      setState(json ?? { loggedIn: true, isOwner: false });
      const p = json?.partner;
      setForm({ placeName: p?.place_name ?? json?.defaults?.placeName ?? "", address: p?.place_address ?? "", phone: p?.place_phone ?? json?.defaults?.phone ?? "", message: p?.message ?? "" });
      if (p?.order_modes?.length) setModes(p.order_modes);
    })();
    return () => { cancelled = true; };
  }, []);

  const here = `/partner/store${placeId ? `?place=${placeId}` : ""}`;
  if (!state) return null;
  if (!state.loggedIn) return <a href={`/signup-owner?kind=store&redirect=${encodeURIComponent(here)}`} style={primary}>사장님으로 가입하고 상담 신청하기</a>;
  if (!state.isOwner) return <a href={`/signup-owner?kind=store&redirect=${encodeURIComponent(here)}`} style={primary}>사장님으로 전환하고 상담 신청하기</a>;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요해요.");
      const res = await fetch("/api/owner/store-partner", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ ...form, orderModes: modes, placeId }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "신청하지 못했어요.");
      setState((s) => (s ? { ...s, partner: { status: json.status, place_name: form.placeName, place_address: form.address, place_phone: form.phone, order_modes: modes, message: form.message, admin_note: null } } : s));
    } catch (e) { setError(e instanceof Error ? e.message : "신청하지 못했어요."); }
    finally { setBusy(false); }
  };

  const status = state.partner?.status;
  const toggle = (m: OrderType) => setModes((all) => (all.includes(m) ? all.filter((x) => x !== m) : [...all, m]));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {status && (
        <div role="status" style={{ padding: "12px 14px", borderRadius: 12, background: status === "rejected" ? "#FDF3F1" : "#E4EBDC", color: status === "rejected" ? "#9A3B27" : "#3F5230", fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>
          {STATUS_TEXT[status]}
          {state.partner?.admin_note && status === "rejected" && <div style={{ fontWeight: 500, marginTop: 4 }}>{state.partner.admin_note}</div>}
        </div>
      )}
      <input value={form.placeName} onChange={(e) => setForm({ ...form, placeName: e.target.value })} disabled={status === "approved"} placeholder="가게 이름" aria-label="가게 이름" maxLength={60} style={input} />
      <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={status === "approved"} placeholder="가게 주소" aria-label="가게 주소" maxLength={200} style={input} />
      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={status === "approved"} placeholder="연락받을 전화번호" aria-label="연락받을 전화번호" inputMode="tel" maxLength={20} style={input} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#2F3B28", marginBottom: 6 }}>받고 싶은 방식</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(ORDER_TYPE_LABEL) as OrderType[]).map((m) => {
            const on = modes.includes(m);
            return (
              <button key={m} type="button" onClick={() => toggle(m)} aria-pressed={on} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 999, border: `1px solid ${on ? "#5C7A4A" : "#E8DFD2"}`, background: on ? "#E4EBDC" : "white", color: on ? "#3F5230" : "#5f6656", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {on && <Check size={14} />}{ORDER_TYPE_LABEL[m]}
              </button>
            );
          })}
        </div>
      </div>
      <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} disabled={status === "approved"} rows={3} maxLength={500} placeholder="궁금한 점이나 판매하는 메뉴를 적어 주십시오(선택)" aria-label="문의 내용" style={{ ...input, resize: "vertical" }} />
      {error && <div role="alert" style={{ fontSize: 13.5, fontWeight: 700, color: "#B4412B" }}>{error}</div>}
      <button type="button" onClick={submit} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
        {busy ? "보내는 중…" : status === "approved" ? "받을 방식 저장" : status ? "다시 보내기" : "입점 상담 신청하기"}
      </button>
    </div>
  );
}
