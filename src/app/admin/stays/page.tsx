"use client";

// 관리자 "숙박 예약" — 「같이가개 숙소 입점 계약서」 제11·14·20조 처리 화면
//   · 문제 접수: 손님 접수 내용 + 사장님 의견을 보고 판단(정상 이용 / 숙소 사정 / 손님 정보 불일치)
//   · 배상금 미정: 기준에 비율이 없는 구간(성수기 2일 전~당일)의 숙소 사정 취소 배상금을 정함
//   · 정산 예정: 결제대행 연동 전에는 직접 이체한 뒤 "보냄"으로 표시
//   · 최근 예약: 결제 확인 전 예약을 "결제 확인"으로 표시(연동 전 임시)
//   · 입점 심사: 숙소 입점 신청 승인·반려(PartnersView)
//   · 후기 신고: 숙소 사장님이 신고한 숙박 후기 검토 — 유지·가리기·삭제, 작성자 후기 제한(ReviewReportsView)
// 서버는 /api/admin/stays, 규칙은 src/lib/lodgingPolicy.ts.

import { isOwnerViolation, OWNER_VIOLATION_KINDS } from "@/lib/lodgingPolicy";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import LogoLoader from "@/components/LogoLoader";
import PartnersView from "./PartnersView";
import StorePartnersView from "./StorePartnersView";
import StoreOrdersView from "./StoreOrdersView";
import ReviewReportsView from "./ReviewReportsView";
import LeadsView from "./LeadsView";
import { won } from "@/lib/ownerPlans";
import { petLabel, stayDayLabel, STAY_STATUS, type StayPet, type StayStatus } from "@/lib/lodgingBooking";
import { CANCEL_CAUSE_LABEL, type CancelCause } from "@/lib/lodgingPolicy";

type Row = {
  id: number; place_id: number; placeName: string | null; room_name: string; guest_name: string; guest_phone: string; check_in: string; check_out: string; nights: number;
  guests: number; pets: StayPet[]; total: number; status: StayStatus; payment_status: string; cancel_cause: CancelCause | null; refund_amount: number; penalty_amount: number;
  compensation_amount: number | null; issue_status: string; issue_kind: string | null; issue_detail: string | null; issue_owner_reply: string | null; issue_opened_at: string | null;
  fee_rate: number | null; fee_amount: number | null; payout_amount: number | null; payout_due_on: string | null; payout_status: string; created_at: string;
  paid_at?: string | null; refund_done_at?: string | null; refund_done_by?: string | null;
};
type View = "issues" | "payouts" | "refunds" | "all" | "partners" | "reviews" | "leads" | "store" | "orders";

const ISSUE_LABEL: Record<string, string> = { ...OWNER_VIOLATION_KINDS, refused: "반려동물과 함께 입실 거부", different_room: "예약한 객실·시설과 다름", pet_condition: "동반 조건이 안내와 다름", facility: "시설·위생 문제", other: "기타" };
const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px" };
const btn = (kind: "primary" | "plain" | "danger", disabled = false): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2e4e8"}`,
  background: disabled ? "#d6d3c9" : kind === "primary" ? "#5C7A4A" : "white", color: kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#555",
});

export default function AdminStays() {
  const [view, setView] = useState<View>("issues");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  const call = useCallback(async (init: RequestInit = {}, query = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch(`/api/admin/stays${query}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    if (view === "partners" || view === "reviews" || view === "leads" || view === "store" || view === "orders") return;
    try { const json = await call({}, `?view=${view}`); setReady(json.ready !== false); setRows(json.bookings ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setRows([]); }
  }, [call, view]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const act = async (body: Record<string, unknown>, done: string, confirmText?: string) => {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    setMessage(null);
    try { await call({ method: "POST", body: JSON.stringify(body) }); setMessage({ ok: true, text: done }); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="stays" onRefresh={load} />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", display: "grid", gap: 12, wordBreak: "keep-all" }}>
        <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>숙박 예약</div>
        <div style={{ fontSize: 12.5, color: "#5c5c5c", lineHeight: 1.7 }}>
          문제 접수는 손님 내용과 사장님 의견(3영업일)을 보고 판단해 주세요.<br />
          결제대행 연동 전에는 결제 확인과 정산 이체를 직접 표시합니다.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["issues", "문제 접수 · 배상금 미정"], ["payouts", "정산 예정"], ["refunds", "환불 처리"], ["all", "최근 예약"], ["partners", "입점 심사"], ["leads", "입점 영업"], ["reviews", "후기 신고"], ["store", "쇼핑 입점"], ["orders", "쇼핑 주문"]] as [View, string][]).map(([key, text]) => (
            <button key={key} onClick={() => { setView(key); setRows(null); }} aria-pressed={view === key} style={{ padding: "7px 13px", borderRadius: 999, border: "none", background: view === key ? "#5C7A4A" : "white", color: view === key ? "white" : "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: view === key ? "none" : "inset 0 0 0 1px #e5e0d0" }}>{text}</button>
          ))}
        </div>
        {view === "orders" ? <StoreOrdersView /> : view === "store" ? <StorePartnersView /> : view === "partners" ? <PartnersView /> : view === "reviews" ? <ReviewReportsView /> : view === "leads" ? <LeadsView /> : <>
        {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
        {!ready && <div style={{ ...card, color: "#9a3412", fontSize: 13 }}>Supabase SQL 편집기에서 <b>scripts/sql/lodging-settlement.sql</b>을 실행해 주세요.</div>}
        {rows === null && <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>}
        {rows?.length === 0 && ready && <div style={{ ...card, textAlign: "center", color: "#6e6e6e", fontSize: 13 }}>처리할 예약이 없어요.</div>}

        {rows?.map((b) => {
          const st = STAY_STATUS[b.status];
          const needsComp = b.compensation_amount == null && (b.cancel_cause === "owner" || b.cancel_cause === "owner_pet_refused");
          return (
            <div key={b.id} style={{ ...card, borderLeft: `4px solid ${b.issue_status === "open" ? "#DC2626" : needsComp ? "#F59E0B" : "#e5e0d0"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: st.background, color: st.color }}>{st.label}</span>
                <b style={{ fontSize: 14 }}>{b.placeName ?? `장소 #${b.place_id}`}</b>
                <span style={{ fontSize: 12.5, color: "#666" }}>{b.room_name} · {stayDayLabel(b.check_in)}~{stayDayLabel(b.check_out)} {b.nights}박</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>예약 #{b.id}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
                {b.guest_name} · {b.guest_phone} · {b.guests}명 · {b.pets.map(petLabel).join(", ")}<br />
                결제 {won(b.total)} ({b.payment_status === "paid" ? "결제 완료" : b.payment_status === "unpaid" ? "결제 확인 전" : b.payment_status === "refunded" ? "전액 환불" : "일부 환불"})
                {b.cancel_cause && <> · {CANCEL_CAUSE_LABEL[b.cancel_cause]} · 환불 {won(b.refund_amount)}{b.penalty_amount > 0 ? ` · 위약금 ${won(b.penalty_amount)}` : ""}</>}
                {b.payout_amount != null && b.payout_amount !== 0 && <> · 정산 {won(b.payout_amount)}{b.fee_amount ? ` (수수료 ${b.fee_rate}% ${won(b.fee_amount)})` : ""}{b.payout_due_on ? ` · ${stayDayLabel(b.payout_due_on)}` : ""}</>}
              </div>

              {b.issue_status === "open" && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "#FEF2F2", display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                    <b style={{ color: "#B91C1C" }}>{isOwnerViolation(b.issue_kind) ? "숙소 접수" : "손님 접수"} · {ISSUE_LABEL[b.issue_kind ?? ""] ?? b.issue_kind}</b><br />
                    <span style={{ whiteSpace: "pre-line" }}>{b.issue_detail}</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.65, color: b.issue_owner_reply ? "#333" : "#666" }}>
                    <b>사장님 의견</b><br />{b.issue_owner_reply ?? "아직 없음 — 3영업일이 지나면 접수 자료만으로 판단할 수 있어요(계약서 제11조)."}
                  </div>
                  <textarea value={notes[b.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [b.id]: e.target.value }))} rows={2} placeholder="판단 이유(손님·사장님에게 보여요)" style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 12.5, boxSizing: "border-box", fontFamily: "inherit" }} />
                  {isOwnerViolation(b.issue_kind) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button disabled={busy} onClick={() => act({ id: b.id, action: "resolve", decision: "violation_upheld", note: notes[b.id] }, "위반으로 판단했어요.", "위반으로 판단할까요? 판단 이유에 남은 숙박일 정산이나 배상 내용을 적어 주세요. 금액 처리는 직접 진행합니다.")} style={btn("primary", busy)}>위반 인정</button>
                      <button disabled={busy} onClick={() => act({ id: b.id, action: "resolve", decision: "violation_dismissed", note: notes[b.id] }, "위반이 아닌 것으로 판단했어요.", "위반이 아닌 것으로 판단할까요? 멈춘 정산이 다시 진행됩니다.")} style={btn("plain", busy)}>위반 아님</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button disabled={busy} onClick={() => act({ id: b.id, action: "resolve", decision: "stay_ok", note: notes[b.id] }, "정상 이용으로 확정했어요.", "정상 이용으로 보고 이용 확정·정산을 진행할까요?")} style={btn("plain", busy)}>정상 이용 → 이용 확정</button>
                    <button disabled={busy} onClick={() => act({ id: b.id, action: "resolve", decision: "owner_refused", note: notes[b.id] }, "숙소 사정으로 처리했어요.", "숙소 사정으로 보고 손님에게 전액 환불 + 배상할까요?")} style={btn("danger", busy)}>숙소 사정 → 전액 환불 + 배상</button>
                    <button disabled={busy} onClick={() => act({ id: b.id, action: "resolve", decision: "guest_mismatch", note: notes[b.id] }, "손님 정보 불일치로 처리했어요.", "손님이 반려동물 정보를 다르게 적은 것으로 보고 당일 취소 기준으로 처리할까요?")} style={btn("plain", busy)}>손님 정보 불일치 → 당일 취소</button>
                  </div>
                </div>
              )}

              {needsComp && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  <span style={{ color: "#B45309", fontWeight: 700 }}>배상금 미정(성수기 2일 전~당일 숙소 사정 취소)</span>
                  <input value={amounts[b.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value.replace(/[^\d]/g, "") }))} placeholder="배상금(원)" inputMode="numeric" style={{ width: 120, padding: "7px 9px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12.5 }} />
                  <button disabled={busy || !amounts[b.id]} onClick={() => act({ id: b.id, action: "compensation", amount: Number(amounts[b.id]) }, "배상금을 정했어요.")} style={btn("primary", busy || !amounts[b.id])}>정하기</button>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {b.payment_status === "unpaid" && b.status !== "declined" && <button disabled={busy} onClick={() => act({ id: b.id, action: "mark_paid" }, "결제를 확인했어요.", `${b.guest_name}님의 ${won(b.total)} 결제를 확인했나요?\n(결제대행 연동 전 임시 기능)`)} style={btn("plain", busy)}>결제 확인</button>}
                {b.payout_status === "scheduled" && (b.payout_amount ?? 0) > 0 && <button disabled={busy} onClick={() => act({ id: b.id, action: "mark_paid_out" }, "정산을 보냄으로 표시했어요.", `숙소 계좌로 ${won(b.payout_amount ?? 0)}을 보냈나요?`)} style={btn("primary", busy)}>정산 보냄</button>}
                {b.refund_amount > 0 && b.paid_at && !b.refund_done_at && <button disabled={busy} onClick={() => act({ id: b.id, action: "mark_refunded" }, "환불을 보냄으로 표시했어요. 손님에게 알렸어요.", `${b.guest_name}님에게 ${won(b.refund_amount)}을 돌려줬나요?\n(결제대행 연동 전 임시 — 직접 환불한 뒤 눌러 주세요)`)} style={btn("primary", busy)}>환불 보냄</button>}
                {b.refund_done_at && <span style={{ fontSize: 12, color: "#15803D", fontWeight: 700, alignSelf: "center" }}>환불 보냄 · {b.refund_done_at.slice(0, 10)}{b.refund_done_by ? ` · ${b.refund_done_by}` : ""}</span>}
              </div>
            </div>
          );
        })}
        </>}
      </div>
    </div>
  );
}
