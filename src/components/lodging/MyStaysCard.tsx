"use client";

// 주문·예약 내역의 "숙소 예약"(손님용, /orders?tab=stay)
//   · 결제 대기: [결제하기]·[예약 지우기] — 20분 안에 결제하지 않으면 날짜가 풀립니다
//   · 결제 수단·영수증·환불 금액
//   · 진행 중: 상태, 날짜·객실·금액, 숙소 연락처, 날짜별 환불 안내, [예약 취소](돌려받는 금액을 먼저 보여 줌)
//   · 체크인 날부터: [문제 있어요](입실 거부·객실 다름 등) — 접수하면 이용 확정·정산이 멈추고 관리자가 확인
//   · 체크아웃 날부터: [이용 확정] — 누르지 않으면 3일 뒤 자동 확정
//   · 끝난 예약: 이용 완료·취소(환불 금액)·거절 이유
//   · 체크아웃 날부터: [숙박 후기 쓰기](숙소 화면의 숙박 후기 칸으로) — 이미 남겼으면 "후기를 남겼어요"
// 서버는 /api/lodging/bookings, 규칙은 src/lib/lodgingPolicy.ts(계약서 제10~15조).

import { useCallback, useEffect, useState } from "react";
import { BedDouble, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { startPayment } from "@/lib/startPayment";
import { won } from "@/lib/ownerPlans";
import { petLabel, stayDayLabel, STAY_STATUS, type StayPet, type StayStatus } from "@/lib/lodgingBooking";
import { autoConfirmOn, CANCEL_CAUSE_LABEL, isOwnerViolation, OWNER_VIOLATION_KINDS, type CancelCause } from "@/lib/lodgingPolicy";

type Stay = {
  id: number; place_id: number; room_name: string; check_in: string; check_out: string; nights: number; guests: number; pets: StayPet[];
  total: number; stamp_discount?: number | null; status: StayStatus; owner_note: string | null; created_at: string;
  payment_status?: string; cancel_cause?: CancelCause | null; refund_amount?: number; compensation_amount?: number | null;
  issue_status?: string; issue_kind?: string | null; issue_resolution?: string | null; stay_confirmed_at?: string | null;
  place: { name: string; address: string | null; phone: string | null } | null;
  payment?: { method: string | null; receiptUrl: string | null; paidAt: string | null; refunded: number } | null;
  refund_done_at?: string | null;
  checkInTime: string | null; checkOutTime: string | null;
  cancelNow: { refund: number; penalty: number; rate: number | null } | null;
  schedule: { until: string; refund: number; rate: number }[];
  canConfirm: boolean; canReportIssue: boolean;
  /** 숙박 후기를 남길 수 있는지(체크아웃 날부터·아직 안 남김) / 이미 남겼는지 */
  canReview?: boolean; reviewed?: boolean;
};

const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #e3eaf3", padding: "16px 16px" };
const button = (kind: "primary" | "plain" | "danger", disabled = false): React.CSSProperties => ({
  padding: "9px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2e4e8"}`,
  background: disabled ? "#d6d3c9" : kind === "primary" ? "#1D4F91" : "white", color: kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#555",
});

export default function MyStaysCard({ showEmpty = false }: { showEmpty?: boolean }) {
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [issueKinds, setIssueKinds] = useState<Record<string, string>>({});
  const [issueFor, setIssueFor] = useState<number | null>(null);
  const [issue, setIssue] = useState({ kind: "", detail: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch("/api/lodging/bookings", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { const json = await call(); if (json) { setStays(json.bookings ?? []); setIssueKinds(json.issueKinds ?? {}); } }
    catch { setStays([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try { await call({ method: "PATCH", body: JSON.stringify(body) }); setMessage({ ok: true, text: done }); setIssueFor(null); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };
  const cancel = (s: Stay) => {
    const c = s.cancelNow;
    if (!c) return;
    const text = c.penalty > 0 ? `지금 취소하면 ${won(c.refund)}을 돌려받아요.\n(${won(c.penalty)}은 취소 규정에 따라 공제)` : `지금 취소하면 ${won(c.refund)} 전액을 돌려받아요.`;
    if (!window.confirm(`${s.place?.name ?? "숙소"} ${stayDayLabel(s.check_in)} 예약을 취소할까요?\n\n${text}`)) return;
    act({ id: s.id, action: "cancel" }, "예약을 취소했어요.");
  };

  const pay = async (s: Stay) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try { await startPayment("lodging", s.id); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "결제를 시작하지 못했어요." }); }
    finally { setBusy(false); }
  };

  if (!stays) return null;
  if (stays.length === 0) {
    if (!showEmpty) return null;
    return <div style={{ ...card, textAlign: "center", fontSize: 14, color: "#5F4D3A", lineHeight: 1.7 }}>아직 숙소 예약이 없어요.<br /><a href="/stay" style={{ color: "#8C5E3A", fontWeight: 800 }}>동반 숙소 둘러보기</a></div>;
  }
  const isOpen = (s: Stay) => s.status === "pending_payment" || s.status === "requested" || s.status === "confirmed";
  const open = stays.filter(isOpen);
  const done = stays.filter((s) => !isOpen(s));

  const row = (s: Stay) => {
    const st = STAY_STATUS[s.status];
    return (
      <div key={s.id} style={{ padding: "13px 14px", borderRadius: 14, border: "1px solid #eef1f5", background: s.issue_status === "open" ? "#FFF7ED" : "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: st.background, color: st.color }}>{s.status === "completed" ? "이용 확정" : st.label}</span>
          {s.issue_status === "open" && <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C" }}>문제 확인 중</span>}
          <a href={`/place/${s.place_id}`} style={{ fontSize: 14, fontWeight: 800, color: "#222", textDecoration: "none" }}>{s.place?.name ?? "숙소"}</a>
        </div>
        <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>
          {stayDayLabel(s.check_in)} {s.checkInTime ?? ""} ~ {stayDayLabel(s.check_out)} {s.checkOutTime ?? ""} · {s.nights}박 · {s.room_name}
        </div>
        <div style={{ fontSize: 12, color: "#5c5c5c", marginTop: 3 }}>{s.guests}명 · {s.pets.map(petLabel).join(", ")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14, color: "#1D4F91" }}>{won(s.total)}</b>
          {(s.stamp_discount ?? 0) > 0 && <span style={{ fontSize: 11.5, color: "#8A6D1F" }}>스탬프 {won(s.stamp_discount ?? 0)} 할인</span>}
          {s.payment_status === "unpaid" && (s.status === "requested" || s.status === "confirmed") && <span style={{ fontSize: 11.5, color: "#B45309" }}>결제 안내를 기다리는 중</span>}
          {s.payment_status === "paid" && <span style={{ fontSize: 12, color: "#555" }}>결제 완료{s.payment?.method ? ` · ${s.payment.method}` : ""}</span>}
          {(s.payment_status === "refunded" || s.payment_status === "partially_refunded") && <span style={{ fontSize: 12, color: "#555" }}>{s.refund_done_at ? "환불 완료" : "환불 처리 중"}</span>}
          {s.payment?.receiptUrl && <a href={s.payment.receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#1D4F91" }}>영수증</a>}
          {s.place?.phone && <a href={`tel:${s.place.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: "#1D4F91", textDecoration: "none" }}><Phone size={12} />숙소에 전화</a>}
        </div>

        {/* 끝난 예약의 결과 */}
        {s.cancel_cause && (
          <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
            {CANCEL_CAUSE_LABEL[s.cancel_cause]} · 환불 {won(s.refund_amount ?? 0)}{s.compensation_amount ? ` + 배상 ${won(s.compensation_amount)}` : ""}
          </div>
        )}
        {s.owner_note && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>숙소: {s.owner_note}</div>}
        {isOwnerViolation(s.issue_kind) && (
          <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 10, background: "#FFF8F6", border: "1px solid #F3D9D2", fontSize: 12, color: "#5A4A44", lineHeight: 1.6 }}>
            <b style={{ color: "#9A3B27" }}>숙소가 규정 위반을 접수했어요</b> · {OWNER_VIOLATION_KINDS[s.issue_kind ?? ""]}
            {s.issue_status === "open" && <><br />같이가개가 양쪽 의견을 확인하고 있어요. 이의가 있으면 <a href={`mailto:infoker12@naver.com?subject=${encodeURIComponent(`[같이가개] 예약 #${s.id} 이의 제기`)}`} style={{ color: "#9A3B27", fontWeight: 700 }}>메일로 알려 주세요</a>.</>}
          </div>
        )}
        {s.issue_resolution && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>처리 결과: {s.issue_resolution}</div>}

        {/* 진행 중인 예약 */}
        {s.schedule.length > 0 && s.status === "confirmed" && (
          <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 6, lineHeight: 1.6 }}>
            {s.schedule.slice(0, 3).map((r) => `${stayDayLabel(r.until)}까지 ${r.rate === 0 ? "전액" : won(r.refund)}`).join(" · ")}
          </div>
        )}
        {s.status === "confirmed" && !s.canConfirm && s.issue_status !== "open" && (
          <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 4 }}>체크아웃 날부터 이용 확정할 수 있어요. 누르지 않으면 {stayDayLabel(autoConfirmOn(s.check_out))}에 자동 확정돼요.</div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {s.status === "pending_payment" && <button onClick={() => pay(s)} disabled={busy} style={button("primary", busy)}>결제하기</button>}
          {s.status === "pending_payment" && <button onClick={() => act({ id: s.id, action: "abandon" }, "예약을 지웠어요.")} disabled={busy} style={button("plain", busy)}>예약 지우기</button>}
          {s.canConfirm && <button onClick={() => act({ id: s.id, action: "confirm" }, "이용을 확정했어요. 즐거우셨길 바라요!")} disabled={busy} style={button("primary", busy)}>이용 확정</button>}
          {s.canReportIssue && <button onClick={() => { setIssueFor(issueFor === s.id ? null : s.id); setIssue({ kind: "", detail: "" }); }} style={button("plain")}>문제 있어요</button>}
          {s.cancelNow && <button onClick={() => cancel(s)} disabled={busy} style={button("danger", busy)}>예약 취소</button>}
          {s.canReview && <a href={`/stay/${s.place_id}#stay-reviews`} style={{ ...button("primary"), background: "#B45309", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>숙박 후기 쓰기</a>}
          {s.reviewed && <span style={{ fontSize: 12, color: "#15803D", fontWeight: 700, alignSelf: "center" }}>후기를 남겼어요</span>}
        </div>

        {issueFor === s.id && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "#F7F3E8", display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#444" }}>어떤 문제가 있었나요?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(issueKinds).map(([key, text]) => (
                <button key={key} onClick={() => setIssue((v) => ({ ...v, kind: key }))} aria-pressed={issue.kind === key} style={{ padding: "7px 11px", borderRadius: 999, border: `1px solid ${issue.kind === key ? "#B91C1C" : "#e2dcc8"}`, background: issue.kind === key ? "#FEE2E2" : "white", color: issue.kind === key ? "#B91C1C" : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{text}</button>
              ))}
            </div>
            <textarea value={issue.detail} onChange={(e) => setIssue((v) => ({ ...v, detail: e.target.value.slice(0, 600) }))} rows={3} placeholder="무슨 일이 있었는지 적어 주세요. 숙소와 나눈 메시지·사진이 있으면 담당자가 연락드릴 때 보내 주세요." style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
            <div style={{ fontSize: 11.5, color: "#5c5c5c", lineHeight: 1.6 }}>접수하면 이용 확정과 숙소 정산이 멈추고, 같이가개가 숙소 의견을 들은 뒤 환불 여부를 알려 드려요.</div>
            <button onClick={() => act({ id: s.id, action: "issue", ...issue }, "문제를 접수했어요. 확인 후 알려 드릴게요.")} disabled={busy || !issue.kind || !issue.detail.trim()} style={button("primary", busy || !issue.kind || !issue.detail.trim())}>접수하기</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="stays" style={{ ...card, margin: "0 0 16px", scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <BedDouble size={17} color="#1D4F91" />
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>내 숙박 예약</div>
        {open.length > 0 && <span style={{ fontSize: 12, color: "#5c5c5c" }}>진행 중 {open.length}건</span>}
      </div>
      {message && <div role="status" style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {open.map(row)}
        {done.length > 0 && <details><summary style={{ fontSize: 12.5, color: "#5c5c5c", cursor: "pointer", padding: "4px 0" }}>지난 예약 {done.length}건</summary><div style={{ display: "grid", gap: 8, marginTop: 8 }}>{done.map(row)}</div></details>}
      </div>
    </div>
  );
}
