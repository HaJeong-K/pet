"use client";

// 사장님 센터의 "상품" · "예약" 화면.
//   · 상품: 이름·설명·가격을 올리고, 잠시 안 파는 상품은 꺼 둘 수 있습니다.
//   · 예약: 손님이 넣은 예약 포장 요청을 확정·거절하고, 준비 완료·수령 완료로 넘깁니다.
// 손님에게 보이는 것은 '프리미엄 스토어' 이상일 때입니다(상품을 미리 올려 두는 것은 언제든 가능).
// 결제는 받지 않습니다 — 손님은 가게에서 결제합니다.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Package, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import OwnerAlertCard from "@/components/owner/OwnerAlertCard";
import { playBark } from "@/lib/ownerAlertSound";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { isOpenStatus, ownerNextStatuses, PRODUCT_DESC_MAX, PRODUCT_NAME_MAX, STATUS_LABEL, type ReservationLine, type ReservationStatus } from "@/lib/storeRules";

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const primaryButton = (disabled: boolean): React.CSSProperties => ({ padding: "10px 16px", borderRadius: 10, border: "none", background: disabled ? "#d6d3c9" : "#B45309", color: "white", fontSize: 13, fontWeight: 800, cursor: disabled ? "default" : "pointer" });

type Product = { id: number; name: string; description: string | null; price: number; is_active: boolean };
type Reservation = {
  id: number; customer_name: string; customer_phone: string; items: ReservationLine[]; total: number;
  pickup_at: string | null; memo: string | null; status: ReservationStatus; owner_note: string | null; created_at: string;
};

async function call(path: string, method: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}
/** 관리자가 다른 가게를 볼 때만 주소에 가게 번호를 붙입니다(사장님 본인은 서버가 본인 가게로 고정) */
const withPlace = (path: string, placeId: number, isPreview: boolean, extra = "") => `${path}?${isPreview ? `placeId=${placeId}&` : ""}${extra}`.replace(/[?&]$/, "");
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "");
const fmtPhone = (digits: string) => digits.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");

function NotReady({ isPreview }: { isPreview: boolean }) {
  return (
    <div style={{ ...card, fontSize: 13, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
      상품·예약 기능을 준비하고 있어요.
      {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/owner-store.sql</b>을 한 번 실행하면 열려요.</>}
    </div>
  );
}

/** 요금제 안내 — 상품·예약은 '프리미엄 스토어' 이상에서 손님에게 보입니다 */
function PlanNotice({ onGoAds }: { onGoAds: () => void }) {
  return (
    <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", fontSize: 13, color: "#78350F", lineHeight: 1.65 }}>
        <b>프리미엄 스토어</b> 요금제부터 상품이 손님에게 보이고 예약을 받을 수 있어요. 상품은 지금 미리 올려 둘 수 있어요.
      </div>
      <button onClick={onGoAds} style={primaryButton(false)}>요금제 보기</button>
    </div>
  );
}

/* ── 상품 ── */
export function ProductsTab({ placeId, isPreview, canAct, onGoAds }: { placeId: number; isPreview: boolean; canAct: boolean; onGoAds: () => void }) {
  const [state, setState] = useState<{ ready: boolean; enabled: boolean; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setState(await call(withPlace("/api/owner/products", placeId, isPreview), "GET")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, [placeId, isPreview]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  const open = (target: Product | "new") => {
    setEditing(target);
    setForm(target === "new" ? { name: "", description: "", price: "" } : { name: target.name, description: target.description ?? "", price: String(target.price) });
    setError(null);
  };
  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { name: form.name, description: form.description, price: Number(form.price.replace(/[^\d]/g, "")) };
      if (editing === "new") await call(withPlace("/api/owner/products", placeId, isPreview), "POST", payload);
      else await call(withPlace("/api/owner/products", placeId, isPreview), "PATCH", { id: editing.id, ...payload });
      setEditing(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  const toggle = async (product: Product) => {
    try { await call(withPlace("/api/owner/products", placeId, isPreview), "PATCH", { id: product.id, is_active: !product.is_active }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
  };
  const remove = async (product: Product) => {
    if (!window.confirm(`"${product.name}"을(를) 삭제할까요?`)) return;
    try { await call(withPlace("/api/owner/products", placeId, isPreview, `id=${product.id}`), "DELETE"); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요."); }
  };

  if (!state) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#999" }}>{error}</span> : <LogoLoader />}</div>;
  if (!state.ready) return <NotReady isPreview={isPreview} />;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!state.enabled && <PlanNotice onGoAds={onGoAds} />}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>우리 가게 상품 {state.products.length}개</div>
          {canAct && <button onClick={() => open("new")} style={{ ...primaryButton(false), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}><Plus size={14} />상품 추가</button>}
        </div>
        <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.6 }}>
          가게 상세 화면에 진열되고, 손님이 예약 포장을 요청할 수 있어요. 결제는 가게에서 받아요(건당 수수료 없음).
        </div>
        {!canAct && <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>보기 전용이에요. 대신 수정하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}
        {error && !editing && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}

        {editing && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#F7F3E8", display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#444" }}>{editing === "new" ? "새 상품" : "상품 수정"}</div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="상품 이름 (예: 수제 닭가슴살 육포 100g)" maxLength={PRODUCT_NAME_MAX} style={input} />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (선택) — 재료, 용량, 알레르기 정보 등" maxLength={PRODUCT_DESC_MAX} style={{ ...input, minHeight: 64, resize: "vertical" }} />
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d]/g, "") })} placeholder="가격 (원)" inputMode="numeric" style={input} />
            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ddd", background: "white", fontSize: 13, fontWeight: 700, color: "#666", cursor: "pointer" }}>취소</button>
              <button onClick={save} disabled={busy || !form.name.trim() || form.price === ""} style={{ ...primaryButton(busy || !form.name.trim() || form.price === ""), flex: 2 }}>{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {state.products.length === 0 && !editing && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "24px 0" }}>아직 올린 상품이 없어요.</div>}
          {state.products.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, border: "1px solid #f0ece0", background: p.is_active ? "white" : "#fafafa", opacity: p.is_active ? 1 : 0.7 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Package size={16} color="#B45309" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222", wordBreak: "break-word" }}>{p.name}{!p.is_active && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "#999" }}>판매 중지</span>}</div>
                {p.description && <div style={{ fontSize: 12, color: "#888", marginTop: 2, lineHeight: 1.5, wordBreak: "break-word" }}>{p.description}</div>}
                <div style={{ fontSize: 13, fontWeight: 800, color: "#B45309", marginTop: 3 }}>{won(p.price)}</div>
              </div>
              {canAct && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => toggle(p)} title={p.is_active ? "판매 중지" : "다시 판매"} style={{ padding: "7px 9px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 11.5, fontWeight: 700, color: "#555", cursor: "pointer" }}>{p.is_active ? "중지" : "판매"}</button>
                  <button onClick={() => open(p)} aria-label={`${p.name} 수정`} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #e2e4e8", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={13} color="#666" /></button>
                  <button onClick={() => remove(p)} aria-label={`${p.name} 삭제`} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #f3c7c5", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} color="#b42318" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 예약 ── */
const STATUS_STYLE: Record<ReservationStatus, { bg: string; color: string }> = {
  requested: { bg: "#FEF3C7", color: "#92400E" },
  accepted: { bg: "#DBEAFE", color: "#1D4ED8" },
  ready: { bg: "#DCFCE7", color: "#15803D" },
  completed: { bg: "#f1f5f9", color: "#64748b" },
  rejected: { bg: "#FEE2E2", color: "#B91C1C" },
  cancelled: { bg: "#f1f5f9", color: "#94a3b8" },
};
const ACTION_LABEL: Partial<Record<ReservationStatus, string>> = { accepted: "예약 확정", rejected: "거절", ready: "준비 완료", completed: "수령 완료", cancelled: "예약 취소" };

export function ReservationsTab({ placeId, isPreview, canAct, onGoAds, onCount }: { placeId: number; isPreview: boolean; canAct: boolean; onGoAds: () => void; onCount?: (waiting: number) => void }) {
  const [state, setState] = useState<{ ready: boolean; reservations: Reservation[] } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const lastWaitingRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, products] = await Promise.all([
        call(withPlace("/api/owner/reservations", placeId, isPreview), "GET"),
        call(withPlace("/api/owner/products", placeId, isPreview), "GET").catch(() => ({ enabled: true })),
      ]);
      setState(list);
      setError(null);
      setEnabled(products.enabled !== false);
      const waiting = (list.reservations as Reservation[]).filter((r) => r.status === "requested").length;
      // 이 화면을 보는 동안 새 예약이 늘면 "멍멍!"(처음 불러올 때는 울리지 않음)
      if (!isPreview && lastWaitingRef.current != null && waiting > lastWaitingRef.current) playBark();
      lastWaitingRef.current = waiting;
      onCount?.(waiting);
      // 아래 탭바의 알림 숫자도 같이 맞춥니다(관리자가 다른 가게를 보는 중에는 건드리지 않음)
      if (!isPreview) window.dispatchEvent(new CustomEvent("ggk-owner-waiting", { detail: waiting }));
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, isPreview]);
  // 화면이 뜰 때 한 번, 그 뒤로는 1분마다 새 예약이 왔는지 다시 봅니다.
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const change = async (reservation: Reservation, status: ReservationStatus) => {
    if (busyId != null) return;
    let ownerNote: string | undefined;
    if (status === "rejected" || status === "cancelled") {
      const typed = window.prompt(status === "rejected" ? "거절 사유를 손님에게 알려 주세요(선택)" : "취소 사유를 손님에게 알려 주세요(선택)", "");
      if (typed === null) return;
      ownerNote = typed;
    }
    setBusyId(reservation.id);
    try { await call(withPlace("/api/owner/reservations", placeId, isPreview), "PATCH", { id: reservation.id, status, ownerNote }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusyId(null); }
  };

  if (!state) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#999" }}>{error}</span> : <LogoLoader />}</div>;
  if (!state.ready) return <NotReady isPreview={isPreview} />;

  const open = state.reservations.filter((r) => isOpenStatus(r.status));
  const done = state.reservations.filter((r) => !isOpenStatus(r.status));
  const renderOne = (r: Reservation) => (
    <div key={r.id} style={{ padding: "13px 14px", borderRadius: 14, border: `1px solid ${r.status === "requested" ? "#FDE68A" : "#f0ece0"}`, background: r.status === "requested" ? "#FFFDF5" : "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: STATUS_STYLE[r.status].bg, color: STATUS_STYLE[r.status].color }}>{STATUS_LABEL[r.status]}</span>
        <b style={{ fontSize: 13.5, color: "#222" }}>{r.customer_name}</b>
        <a href={`tel:${r.customer_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "#3F5230", textDecoration: "none" }}><Phone size={12} />{fmtPhone(r.customer_phone)}</a>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>{fmtDateTime(r.created_at)} 접수</span>
      </div>
      <div style={{ marginTop: 9, display: "grid", gap: 3 }}>
        {r.items.map((line) => (
          <div key={line.productId} style={{ display: "flex", gap: 8, fontSize: 13, color: "#333" }}>
            <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{line.name} × {line.qty}</span>
            <span style={{ flexShrink: 0, color: "#666" }}>{won(line.price * line.qty)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #eee", fontSize: 12.5, color: "#555", flexWrap: "wrap" }}>
        {r.pickup_at && <span>가지러 올 시간 <b style={{ color: "#B45309" }}>{fmtDateTime(r.pickup_at)}</b></span>}
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: "#222" }}>합계 {won(r.total)}</span>
      </div>
      {r.memo && <div style={{ marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 1.55, wordBreak: "break-word" }}>요청: {r.memo}</div>}
      {r.owner_note && <div style={{ marginTop: 6, fontSize: 12.5, color: "#999", lineHeight: 1.55, wordBreak: "break-word" }}>가게 안내: {r.owner_note}</div>}
      {canAct && ownerNextStatuses(r.status).length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {ownerNextStatuses(r.status).map((next) => {
            const negative = next === "rejected" || next === "cancelled";
            return (
              <button key={next} onClick={() => change(r, next)} disabled={busyId === r.id} style={{
                flex: negative ? "0 0 auto" : "1 1 120px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: busyId === r.id ? "default" : "pointer",
                border: negative ? "1px solid #f3c7c5" : "none", background: negative ? "white" : "#B45309", color: negative ? "#b42318" : "white",
              }}>
                {negative ? <X size={13} /> : <Check size={13} />}{ACTION_LABEL[next]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!enabled && <PlanNotice onGoAds={onGoAds} />}
      <OwnerAlertCard placeId={placeId} isPreview={isPreview} />
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>진행 중인 예약 {open.length}건</div>
          {open.some((r) => r.status === "requested") && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>확인 대기 {open.filter((r) => r.status === "requested").length}건</span>}
          <button onClick={load} style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}>새로 고침</button>
        </div>
        <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.6 }}>손님이 예약을 넣으면 먼저 확정하거나 거절해 주세요. 결제는 손님이 가게에 와서 해요.</div>
        {!canAct && <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>보기 전용이에요. 대신 처리하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}
        {error && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {open.length === 0 && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "24px 0" }}>진행 중인 예약이 없어요.</div>}
          {open.map(renderOne)}
        </div>
      </div>
      {done.length > 0 && (
        <div style={card}>
          <button onClick={() => setShowDone((v) => !v)} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            <span className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#555" }}>지난 예약 {done.length}건 {showDone ? "접기" : "보기"}</span>
          </button>
          {showDone && <div style={{ marginTop: 12, display: "grid", gap: 10 }}>{done.map(renderOne)}</div>}
        </div>
      )}
    </div>
  );
}
