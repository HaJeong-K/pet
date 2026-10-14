"use client";

// 장소 상세 화면의 "상품 · 예약 포장" 칸(손님용).
//   · 가게가 '프리미엄 스토어' 이상이고 판매 중인 상품이 있을 때만 보입니다(아니면 아무것도 그리지 않음).
//   · 상품 수량을 고르고 이름·전화·가지러 갈 시간을 적어 예약을 넣습니다. 결제는 가게에서 합니다.
//   · 내가 넣은 예약의 진행 상태를 보고, 가게가 준비를 마치기 전까지 취소할 수 있습니다.
// 사장님 쪽 화면은 components/owner/OwnerStorePanels.tsx, 규칙은 lib/storeRules.ts.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { canChangeStatus, isOpenStatus, PICKUP_MAX_DAYS, RESERVATION_QTY_MAX, STATUS_LABEL, type ReservationLine, type ReservationStatus } from "@/lib/storeRules";

type Product = { id: number; name: string; description: string | null; price: number };
type MyReservation = { id: number; items: ReservationLine[]; total: number; pickup_at: string | null; status: ReservationStatus; owner_note: string | null; created_at: string };
type StoreData = { enabled: boolean; products: Product[]; mine: MyReservation[] };

const STATUS_COLOR: Record<ReservationStatus, { bg: string; color: string }> = {
  requested: { bg: "#FEF3C7", color: "#92400E" },
  accepted: { bg: "#DBEAFE", color: "#1D4ED8" },
  ready: { bg: "#DCFCE7", color: "#15803D" },
  completed: { bg: "#f1f5f9", color: "#64748b" },
  rejected: { bg: "#FEE2E2", color: "#B91C1C" },
  cancelled: { bg: "#f1f5f9", color: "#94a3b8" },
};
const input: React.CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 9, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "");
/** 날짜·시간 입력 칸에 넣을 값(기기 시간대 기준 "2026-10-14T15:30") */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function PlaceStoreSection({ placeId, isLoggedIn }: { placeId: number; isLoggedIn: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<StoreData | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [form, setForm] = useState({ name: "", phone: "", pickupAt: "", memo: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 화면을 연 시각 — 가지러 갈 시간을 고를 수 있는 범위(지금 ~ 14일 뒤)의 기준
  const [openedAt] = useState(() => Date.now());

  const load = useCallback(async (): Promise<StoreData | null> => {
    try {
      const res = await fetch(`/api/store/${placeId}`, { headers: await authHeader(), cache: "no-store" });
      return (await res.json()) as StoreData;
    } catch { return null; }
  }, [placeId]);

  useEffect(() => {
    let cancelled = false;
    load().then((next) => { if (!cancelled) setData(next); });
    return () => { cancelled = true; };
    // 로그인 여부가 바뀌면 "내 예약"을 다시 받습니다.
  }, [load, isLoggedIn]);

  if (!data?.enabled || data.products.length === 0) return null;

  const picked = data.products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = picked.reduce((sum, p) => sum + p.price * (qty[p.id] ?? 0), 0);
  const change = (id: number, delta: number) => setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(RESERVATION_QTY_MAX, (prev[id] ?? 0) + delta)) }));

  const reserve = async () => {
    if (busy) return;
    if (!isLoggedIn) { router.push(`/login?redirect=/place/${placeId}`); return; }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          placeId,
          items: picked.map((p) => ({ productId: p.id, qty: qty[p.id] })),
          name: form.name, phone: form.phone, memo: form.memo,
          pickupAt: form.pickupAt ? new Date(form.pickupAt).toISOString() : "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "예약하지 못했어요.");
      setQty({});
      setForm((prev) => ({ ...prev, pickupAt: "", memo: "" }));
      setMessage({ ok: true, text: "예약을 넣었어요. 가게에서 확인하면 아래 '내 예약'의 상태가 바뀌어요." });
      setData((await load()) ?? data);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "예약하지 못했어요." }); }
    finally { setBusy(false); }
  };

  const cancel = async (reservation: MyReservation) => {
    if (busy || !window.confirm("이 예약을 취소할까요?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/reserve", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ id: reservation.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "취소하지 못했어요.");
      setData((await load()) ?? data);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "취소하지 못했어요." }); }
    finally { setBusy(false); }
  };

  const now = new Date(openedAt);
  const canSubmit = picked.length > 0 && form.name.trim() !== "" && form.phone.replace(/\D/g, "").length >= 9 && !busy;

  return (
    <div data-store-section style={{ marginTop: 14, borderRadius: 12, border: "1px solid #F3E3BC", background: "#FFFDF5", padding: "13px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ShoppingBag size={14} color="#B45309" />
        <h3 className="ggk-title" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111" }}>상품 · 예약 포장</h3>
      </div>
      <div className="ggk-body" style={{ fontSize: 11, color: "#8A6D1F", marginTop: 3, lineHeight: 1.5 }}>미리 예약해 두고 가게에서 받아 가세요. 결제는 가게에서 해요.</div>

      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {data.products.map((p) => {
          const count = qty[p.id] ?? 0;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, background: "white", border: `1px solid ${count > 0 ? "#F0C36A" : "#f0ece0"}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ggk-body" style={{ fontSize: 12.5, fontWeight: 700, color: "#222", wordBreak: "break-word" }}>{p.name}</div>
                {p.description && <div className="ggk-body" style={{ fontSize: 11, color: "#888", marginTop: 1, lineHeight: 1.45, wordBreak: "break-word" }}>{p.description}</div>}
                <div className="ggk-body" style={{ fontSize: 12.5, fontWeight: 800, color: "#B45309", marginTop: 2 }}>{won(p.price)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {count > 0 && (
                  <>
                    <button onClick={() => change(p.id, -1)} aria-label={`${p.name} 하나 빼기`} style={stepButton}><Minus size={13} /></button>
                    <span className="ggk-body" style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 800 }}>{count}</span>
                  </>
                )}
                <button onClick={() => change(p.id, 1)} aria-label={`${p.name} 하나 담기`} style={{ ...stepButton, background: "#B45309", borderColor: "#B45309", color: "white" }}><Plus size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {picked.length > 0 && (
        <div style={{ marginTop: 10, padding: 11, borderRadius: 10, background: "#F7F3E8", display: "grid", gap: 7 }}>
          <div className="ggk-body" style={{ display: "flex", fontSize: 13, fontWeight: 800, color: "#222" }}>
            <span style={{ flex: 1 }}>예약할 상품 {picked.reduce((sum, p) => sum + (qty[p.id] ?? 0), 0)}개</span>
            <span>합계 {won(total)}</span>
          </div>
          {isLoggedIn ? (
            <>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예약자 이름" maxLength={20} style={input} />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="연락받을 전화번호" inputMode="tel" maxLength={13} style={input} />
              <label className="ggk-body" style={{ fontSize: 11, color: "#777" }}>
                가지러 갈 시간 (선택, {PICKUP_MAX_DAYS}일 안)
                <input type="datetime-local" value={form.pickupAt} min={toLocalInput(now)} max={toLocalInput(new Date(now.getTime() + PICKUP_MAX_DAYS * 86_400_000))} onChange={(e) => setForm({ ...form, pickupAt: e.target.value })} style={{ ...input, marginTop: 3 }} />
              </label>
              <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="가게에 전할 말 (선택)" maxLength={200} style={input} />
              <div className="ggk-body" style={{ fontSize: 10.5, color: "#999", lineHeight: 1.5 }}>이름과 전화번호는 예약 확인을 위해 이 가게 사장님에게만 전달돼요.</div>
            </>
          ) : (
            <div className="ggk-body" style={{ fontSize: 11.5, color: "#777" }}>예약은 로그인한 뒤에 할 수 있어요.</div>
          )}
          <button onClick={reserve} disabled={isLoggedIn && !canSubmit} className="ggk-body" style={{ padding: "11px 0", borderRadius: 10, border: "none", background: isLoggedIn && !canSubmit ? "#d6d3c9" : "#B45309", color: "white", fontSize: 13, fontWeight: 800, cursor: isLoggedIn && !canSubmit ? "default" : "pointer" }}>
            {!isLoggedIn ? "로그인하고 예약하기" : busy ? "예약 넣는 중…" : "예약 넣기"}
          </button>
        </div>
      )}

      {message && <div role="status" className="ggk-body" style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c", lineHeight: 1.5 }}>{message.text}</div>}

      {data.mine.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #EAD9A8" }}>
          <div className="ggk-title" style={{ fontSize: 11.5, fontWeight: 800, color: "#666", marginBottom: 6 }}>내 예약</div>
          <div style={{ display: "grid", gap: 6 }}>
            {data.mine.map((r) => (
              <div key={r.id} style={{ padding: "9px 10px", borderRadius: 10, background: "white", border: "1px solid #f0ece0", opacity: isOpenStatus(r.status) ? 1 : 0.75 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span className="ggk-body" style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: STATUS_COLOR[r.status].bg, color: STATUS_COLOR[r.status].color }}>{STATUS_LABEL[r.status]}</span>
                  <span className="ggk-body" style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{won(r.total)}</span>
                  {canChangeStatus("customer", r.status, "cancelled") && (
                    <button onClick={() => cancel(r)} disabled={busy} className="ggk-body" style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 8, border: "1px solid #f3c7c5", background: "white", color: "#b42318", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>예약 취소</button>
                  )}
                </div>
                <div className="ggk-body" style={{ marginTop: 5, fontSize: 11.5, color: "#555", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {r.items.map((line) => `${line.name} × ${line.qty}`).join(", ")}
                </div>
                {r.pickup_at && <div className="ggk-body" style={{ marginTop: 2, fontSize: 11, color: "#888" }}>가지러 갈 시간 {fmtDateTime(r.pickup_at)}</div>}
                {r.owner_note && <div className="ggk-body" style={{ marginTop: 2, fontSize: 11, color: "#888", wordBreak: "break-word" }}>가게 안내: {r.owner_note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const stepButton: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid #ddd", background: "white", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
