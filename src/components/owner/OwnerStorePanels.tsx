"use client";

// 사장님 센터의 "상품" · "예약" 화면.
//   · 상품: 이름·설명·가격을 올리고, 잠시 안 파는 상품은 꺼 둘 수 있습니다.
//   · 예약: 손님의 포장 주문·매장 식사 예약을 확정·거절하고, 준비 완료·이용 완료·노쇼로 넘깁니다.
// 손님에게 보이는 것은 쇼핑 입점 승인 또는 '프리미엄 스토어' 이상일 때입니다(상품을 미리 올려 두는 것은 언제든 가능).
// 선결제 방식입니다 — 손님이 결제를 마친 주문만 보입니다. 거절·가게 취소·취소 요청 승인은 전액 환불, 노쇼는 환불 없음.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Phone, X } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import OwnerAlertCard from "@/components/owner/OwnerAlertCard";
import { playBark } from "@/lib/ownerAlertSound";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import OwnerStoreReviews from "@/components/owner/OwnerStoreReviews";
import { isOpenStatus, ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL, ownerNextStatuses, STATUS_LABEL, type OrderType, type ReservationLine, type ReservationStatus } from "@/lib/storeRules";

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const primaryButton = (disabled: boolean): React.CSSProperties => ({ padding: "10px 16px", borderRadius: 10, border: "none", background: disabled ? "#d6d3c9" : "#B45309", color: disabled ? "#4f4a3f" : "white", fontSize: 13, fontWeight: 800, cursor: disabled ? "default" : "pointer" });

type Reservation = {
  id: number; customer_name: string; customer_phone: string; items: ReservationLine[]; total: number;
  pickup_at: string | null; memo: string | null; status: ReservationStatus; owner_note: string | null; created_at: string; order_type?: OrderType | null; party_size?: number | null;
  payment_status?: string; cancel_request_status?: string; cancel_request_reason?: string | null;
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

/** 입점 안내 — 쇼핑 입점 승인(또는 '프리미엄 스토어') 뒤에 손님에게 보입니다 */
function PlanNotice({ onGoAds: _onGoAds }: { onGoAds: () => void }) {
  return (
    <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", fontSize: 13, color: "#78350F", lineHeight: 1.65 }}>
        <b>쇼핑 입점</b>을 하면 메뉴가 쇼핑 탭에 진열되고, 손님이 포장 주문이나 매장 식사 예약을 넣을 수 있어요.<br />메뉴는 지금 미리 올려 둘 수 있어요.
      </div>
      <a href="/partner/store" style={{ ...primaryButton(false), textDecoration: "none" }}>입점 상담 받기</a>
    </div>
  );
}

/* ── 상품 ── 자세한 상품 올리기 화면은 OwnerProductsTab.tsx */
export { default as ProductsTab } from "@/components/owner/OwnerProductsTab";

/* ── 예약 ── */
const STATUS_STYLE: Record<ReservationStatus, { bg: string; color: string }> = {
  requested: { bg: "#FEF3C7", color: "#92400E" },
  accepted: { bg: "#DBEAFE", color: "#1D4ED8" },
  ready: { bg: "#DCFCE7", color: "#15803D" },
  completed: { bg: "#f1f5f9", color: "#64748b" },
  rejected: { bg: "#FEE2E2", color: "#B91C1C" },
  cancelled: { bg: "#f1f5f9", color: "#5f6672" },
  pending_payment: { bg: "#FEE2E2", color: "#B91C1C" },
  no_show: { bg: "#FEE2E2", color: "#B91C1C" },
};
const ACTION_LABEL: Partial<Record<ReservationStatus, string>> = { accepted: "확정", rejected: "거절", ready: "준비 완료", completed: "이용 완료", no_show: "노쇼", cancelled: "예약 취소" };

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

  if (!state) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#666" }}>{error}</span> : <LogoLoader />}</div>;
  if (!state.ready) return <NotReady isPreview={isPreview} />;

  const open = state.reservations.filter((r) => isOpenStatus(r.status));
  const done = state.reservations.filter((r) => !isOpenStatus(r.status));
  const answerCancel = async (r: Reservation, cancelAnswer: "approve" | "deny") => {
    const ownerNote = cancelAnswer === "deny" ? window.prompt("받지 못하는 이유를 적어 주세요. 손님에게 보여요.") : "";
    if (cancelAnswer === "deny" && !ownerNote?.trim()) return;
    if (cancelAnswer === "approve" && !window.confirm(`${won(r.total)}을 손님에게 전액 환불할까요?`)) return;
    setBusyId(r.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/owner/reservations?placeId=${placeId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ id: r.id, cancelAnswer, ownerNote }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
      await load();
    } catch (e) { window.alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };

  const renderOne = (r: Reservation) => (
    <div key={r.id} style={{ padding: "13px 14px", borderRadius: 14, border: `1px solid ${r.status === "requested" ? "#FDE68A" : "#f0ece0"}`, background: r.status === "requested" ? "#FFFDF5" : "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: STATUS_STYLE[r.status].bg, color: STATUS_STYLE[r.status].color }}>{STATUS_LABEL[r.status]}</span>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "#F3E7D8", color: "#6B4426" }}>{ORDER_TYPE_LABEL[r.order_type ?? "pickup"]}{r.party_size ? ` ${r.party_size}명` : ""}</span>
        <b style={{ fontSize: 13.5, color: "#222" }}>{r.customer_name}</b>
        <a href={`tel:${r.customer_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "#3F5230", textDecoration: "none" }}><Phone size={12} />{fmtPhone(r.customer_phone)}</a>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#6e6e6e" }}>{fmtDateTime(r.created_at)} 접수</span>
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
        {r.pickup_at && <span>{r.order_type === "dine_in" ? "방문 시간" : "가지러 올 시간"} <b style={{ color: "#B45309" }}>{fmtDateTime(r.pickup_at)}</b></span>}
        {PAYMENT_STATUS_LABEL[r.payment_status ?? ""] && <span style={{ fontWeight: 700, color: "#15803D" }}>{PAYMENT_STATUS_LABEL[r.payment_status ?? ""]}</span>}
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: "#222" }}>합계 {won(r.total)}</span>
      </div>
      {r.memo && <div style={{ marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 1.55, wordBreak: "break-word" }}>요청: {r.memo}</div>}
      {r.owner_note && <div style={{ marginTop: 6, fontSize: 12.5, color: "#666", lineHeight: 1.55, wordBreak: "break-word" }}>가게 안내: {r.owner_note}</div>}
      {r.cancel_request_status === "open" && (
        <div style={{ marginTop: 9, padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
          <b>손님이 취소를 요청했어요.</b> {r.cancel_request_reason}
          {canAct && (
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              <button onClick={() => answerCancel(r, "approve")} disabled={busyId === r.id} style={{ padding: "8px 12px", borderRadius: 9, border: "none", background: "#B45309", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>받아 주기(전액 환불)</button>
              <button onClick={() => answerCancel(r, "deny")} disabled={busyId === r.id} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid #f3c7c5", background: "white", color: "#b42318", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>받지 않기</button>
            </div>
          )}
        </div>
      )}
      {canAct && ownerNextStatuses(r.status).length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {ownerNextStatuses(r.status).map((next) => {
            const negative = next === "rejected" || next === "cancelled" || next === "no_show";
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
        <div style={{ fontSize: 12.5, color: "#5c5c5c", marginTop: 4, lineHeight: 1.7 }}>
          손님이 <b style={{ color: "#555" }}>쇼핑 탭</b>이나 우리 가게 상세 화면에서 직접 예약 주문을 넣어요.<br />
          예약이 들어오면 먼저 확정하거나 거절해 주세요. 결제는 손님이 가게에 와서 해요.
        </div>
        {!canAct && <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>보기 전용이에요. 대신 처리하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}
        {error && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {open.length === 0 && <div style={{ fontSize: 13, color: "#6e6e6e", textAlign: "center", padding: "24px 0" }}>진행 중인 예약이 없어요.</div>}
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
      <OwnerStoreReviews placeId={placeId} />
    </div>
  );
}
