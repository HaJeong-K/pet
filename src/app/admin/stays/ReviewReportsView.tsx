"use client";

// 관리자 "숙박 예약 → 후기 신고" — 숙소 사장님이 신고한 숙박 후기를 검토합니다.
//   · 유지: 문제 없음(후기 그대로)
//   · 가리기: 손님에게 안 보이게(블라인드) — 사유 필수, 사장님 화면에 보임
//   · 삭제: 후기를 지움(기록은 남김) — 사유 필수
//   · 가리기·삭제 때 "작성자 숙박 후기 제한"을 고르면 그 손님은 앞으로 숙박 후기를 쓸 수 없습니다
// 낮은 별점이라는 이유만으로는 가리지 않습니다(사실과 다름·욕설·개인정보·관계없는 내용·악의적 후기만).
// 서버는 /api/admin/lodging-reviews.

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { REVIEW_REPORT_REASONS, REVIEW_REPORT_STATUS, type ReviewAdminAction, type ReviewReportStatus } from "@/lib/lodgingReviews";

type Report = {
  id: number; place_id: number; place_name: string | null; room_name: string | null; guest_display_name: string | null; rating: number; content: string;
  owner_reply: string | null; hidden: boolean; created_at: string; report_status: ReviewReportStatus; report_reason: string | null; report_detail: string | null;
  reported_at: string | null; report_decided_at: string | null; report_admin_note: string | null; writer_banned: boolean;
};

const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px" };
const btn = (color: string, disabled: boolean): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 9, border: "none", background: disabled ? "#d6d3c9" : color, color: disabled ? "#4f4a3f" : "white", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });
const STATUS_COLOR: Record<ReviewReportStatus, { bg: string; color: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E" }, kept: { bg: "#DCFCE7", color: "#166534" }, hidden: { bg: "#E0E7FF", color: "#3730A3" }, deleted: { bg: "#FEE2E2", color: "#991B1B" },
};

export default function ReviewReportsView() {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [ready, setReady] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [bans, setBans] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch("/api/admin/lodging-reviews", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { const json = await call(); setReady(json.ready !== false); setRows(json.reports ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setRows([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const act = async (r: Report, action: ReviewAdminAction) => {
    const note = notes[r.id]?.trim() ?? "";
    if (action !== "keep" && !note) { setMessage({ ok: false, text: "가리거나 삭제할 때는 사유를 적어 주세요(사장님 화면에 보여요)." }); return; }
    const ban = action !== "keep" && !!bans[r.id];
    const label = action === "keep" ? "문제 없음으로 유지" : action === "hide" ? "가리기" : "삭제";
    if (busy || !window.confirm(`후기 #${r.id}를 ${label}할까요?${ban ? "\n작성자는 앞으로 숙박 후기를 쓸 수 없어요." : ""}`)) return;
    setBusy(true);
    setMessage(null);
    try { await call({ method: "POST", body: JSON.stringify({ id: r.id, action, note, ban }) }); setMessage({ ok: true, text: `${label} 처리했어요.` }); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {!ready && <div style={{ ...card, color: "#9a3412", fontSize: 13 }}>Supabase SQL 편집기에서 <b>scripts/sql/lodging-guest-review-reports.sql</b>을 실행해 주세요.</div>}
      {rows === null && <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>}
      {rows?.length === 0 && ready && <div style={{ ...card, textAlign: "center", color: "#6e6e6e", fontSize: 13 }}>신고된 숙박 후기가 없어요.</div>}
      {rows?.map((r) => {
        const st = STATUS_COLOR[r.report_status];
        return (
          <div key={r.id} style={{ ...card, borderLeft: `4px solid ${r.report_status === "pending" ? "#F59E0B" : "#e5e0d0"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.color }}>{REVIEW_REPORT_STATUS[r.report_status]}</span>
              <a href={`/stay/${r.place_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 800, color: "#1D4F91" }}>{r.place_name ?? `숙소 #${r.place_id}`}</a>
              <span style={{ fontSize: 12, color: "#666" }}>후기 #{r.id}</span>
              {r.reported_at && <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{stayDayLabel(r.reported_at.slice(0, 10))} 신고</span>}
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "#B45309", fontWeight: 700 }}>
              신고 사유: {REVIEW_REPORT_REASONS.find((x) => x.id === r.report_reason)?.label ?? r.report_reason}{r.report_detail ? ` — ${r.report_detail}` : ""}
            </div>
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#F8FAFC" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
                <span style={{ display: "inline-flex", gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} fill={i <= r.rating ? "#F59E0B" : "none"} color={i <= r.rating ? "#F59E0B" : "#d6d3c9"} />)}</span>
                {r.guest_display_name ?? "손님"} · {r.room_name} · {stayDayLabel(r.created_at.slice(0, 10))} 작성
                {r.writer_banned && <b style={{ color: "#b91c1c" }}>· 작성자 후기 제한 중</b>}
              </div>
              <div style={{ fontSize: 13, color: "#333", marginTop: 5, lineHeight: 1.7, whiteSpace: "pre-line" }}>{r.content}</div>
              {r.owner_reply && <div style={{ fontSize: 12, color: "#666", marginTop: 6, lineHeight: 1.6 }}><b>사장님 답글:</b> {r.owner_reply}</div>}
            </div>
            {r.report_status !== "pending" ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>{r.report_decided_at ? `${stayDayLabel(r.report_decided_at.slice(0, 10))} 처리` : ""}{r.report_admin_note ? ` · ${r.report_admin_note}` : ""}</div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#5c5c5c", lineHeight: 1.6 }}>낮은 별점이라는 이유만으로는 가리지 않아요. 사실과 다름·욕설·개인정보·관계없는 내용·악의적 후기인지 확인해 주세요.</div>
                <textarea value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} rows={2} placeholder="처리 사유(가리기·삭제는 필수 — 사장님 화면에 보여요)" style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 12.5, boxSizing: "border-box", fontFamily: "inherit" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#444", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!bans[r.id]} onChange={(e) => setBans((b) => ({ ...b, [r.id]: e.target.checked }))} />
                  가리기·삭제하면서 작성자의 숙박 후기 작성도 제한(제재)
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button disabled={busy} onClick={() => act(r, "keep")} style={btn("#5C7A4A", busy)}>유지(문제 없음)</button>
                  <button disabled={busy} onClick={() => act(r, "hide")} style={btn("#4F46E5", busy)}>가리기</button>
                  <button disabled={busy} onClick={() => act(r, "delete")} style={btn("#b42318", busy)}>삭제</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
