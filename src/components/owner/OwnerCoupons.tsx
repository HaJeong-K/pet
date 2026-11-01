"use client";

// 사장님 센터 — 가게 쿠폰. 할인 금액은 가게가 부담하고, 손님 한 명당 쿠폰 하나를 한 번 쓸 수 있습니다.
// 서버는 /api/owner/coupons.

import { useCallback, useEffect, useState } from "react";
import { Ticket, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";

type Coupon = { id: number; name: string; discount: number; min_order: number; expires_on: string | null; is_active: boolean };
const field: React.CSSProperties = { minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid #DDDCDB", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", width: "100%" };

export default function OwnerCoupons({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ name: "", discount: "", minOrder: "", expiresOn: "" });
  const [error, setError] = useState("");

  const call = useCallback(async (init?: RequestInit, extra = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요합니다.");
    const query = [isPreview ? `placeId=${placeId}` : "", extra].filter(Boolean).join("&");
    const res = await fetch(`/api/owner/coupons${query ? `?${query}` : ""}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했습니다.");
    return json;
  }, [placeId, isPreview]);
  const load = useCallback(async () => { const d = await call(); setCoupons(d.coupons ?? []); }, [call]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); }
  };
  const add = () => run(async () => {
    await call({ method: "POST", body: JSON.stringify({ name: form.name, discount: Number(form.discount), minOrder: Number(form.minOrder) || 0, expiresOn: form.expiresOn }) });
    setForm({ name: "", discount: "", minOrder: "", expiresOn: "" });
  });

  return (
    <div style={{ marginBottom: 16, padding: 16, borderRadius: 16, background: "white", border: "1px solid #E7E6E5" }}>
      <div className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "#222" }}><Ticket size={17} color="#A05A32" />가게 쿠폰</div>
      <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c", lineHeight: 1.6 }}>
        할인 금액은 가게가 부담합니다.<br />
        손님 한 명당 쿠폰 하나를 한 번 쓸 수 있습니다.
      </div>
      {coupons.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {coupons.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 11, background: "#F4F3F2", opacity: c.is_active ? 1 : 0.6 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <b>{c.name}</b> · {won(c.discount)} 할인
                <div style={{ fontSize: 12.5, color: "#5c5c5c" }}>{c.min_order > 0 ? `${won(c.min_order)} 이상 주문` : "주문 금액 제한 없음"}{c.expires_on ? ` · ${c.expires_on}까지` : ""}</div>
              </div>
              {canAct && <button type="button" onClick={() => run(() => call({ method: "PATCH", body: JSON.stringify({ id: c.id, isActive: !c.is_active }) }))} style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 9, border: "1px solid #DDDCDB", background: "white", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{c.is_active ? "끄기" : "켜기"}</button>}
              {canAct && <button type="button" aria-label={`${c.name} 지우기`} onClick={() => { if (window.confirm("이 쿠폰을 지울까요?")) run(() => call({ method: "DELETE" }, `id=${c.id}`)); }} style={{ flexShrink: 0, width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }}><Trash2 size={15} color="#666" /></button>}
            </div>
          ))}
        </div>
      )}
      {canAct && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 10 }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} placeholder="쿠폰 이름" aria-label="쿠폰 이름" style={field} />
          <input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="할인 금액(원)" aria-label="할인 금액" style={field} />
          <input value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="최소 주문(원)" aria-label="쿠폰 최소 주문 금액" style={field} />
          <input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} aria-label="쿠폰 마지막 날" style={field} />
          <button type="button" onClick={add} style={{ padding: 10, borderRadius: 10, border: "none", background: "#3B2A20", color: "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>쿠폰 만들기</button>
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#B91C1C" }}>{error}</div>}
    </div>
  );
}
