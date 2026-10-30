"use client";

// 사장님 센터 "후기·답글"의 숙박 후기(숙소 사장님) — 같이가개에서 예약하고 이용한 손님의 별점 후기입니다.
//   · 답글 달기·고치기·지우기 — 숙소 화면(/stay/번호)의 후기 아래에 "사장님 답글"로 보입니다
//   · 신고하기 — 사유를 고르면 관리자가 검토해 유지·가리기·삭제합니다(결과와 사유가 여기에 보임)
// 서버는 /api/owner/lodging/reviews, 규칙은 src/lib/lodgingReviews.ts.

import { useCallback, useEffect, useState } from "react";
import { Flag, MessageCircle, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { OWNER_REPLY_MAX, REVIEW_REPORT_REASONS, REVIEW_REPORT_STATUS, type ReviewReportReason, type ReviewReportStatus } from "@/lib/lodgingReviews";

type Review = {
  id: number; room_name: string | null; guest_display_name: string | null; rating: number; content: string; pets_summary: string | null; nights: number | null;
  owner_reply: string | null; owner_replied_at: string | null; hidden: boolean; created_at: string;
  report_status?: ReviewReportStatus | null; report_reason?: string | null; report_admin_note?: string | null;
};

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13.5, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const small = (kind: "primary" | "plain" | "danger", disabled = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2dcc8"}`,
  background: disabled ? "#d6d3c9" : kind === "primary" ? "#B45309" : "white", color: kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#555",
});

export default function OwnerLodgingReviews({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [reportReady, setReportReady] = useState(true);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [report, setReport] = useState<{ reason: ReviewReportReason | ""; detail: string }>({ reason: "", detail: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch(`/api/owner/lodging/reviews${isPreview ? `?placeId=${placeId}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);
  const load = useCallback(async () => {
    try { const json = await call(); setReviews(json.reviews ?? []); setReportReady(json.reportReady !== false); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setReviews([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const run = async (init: RequestInit, done: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try { await call(init); setMessage({ ok: true, text: done }); setReplyFor(null); setReportFor(null); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };
  const saveReply = (r: Review, text: string) => run({ method: "PATCH", body: JSON.stringify({ id: r.id, reply: text }) }, text.trim() ? "답글을 남겼어요. 숙소 화면에 바로 보여요." : "답글을 지웠어요.");
  const sendReport = (r: Review) => {
    if (!report.reason) { setMessage({ ok: false, text: "신고 사유를 골라 주세요." }); return; }
    run({ method: "POST", body: JSON.stringify({ id: r.id, ...report }) }, "신고했어요. 관리자가 검토한 뒤 결과를 여기에 알려 드려요.");
  };

  const unanswered = (reviews ?? []).filter((r) => !r.owner_reply && !r.hidden).length;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Star size={17} color="#B45309" />
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>숙박 후기</div>
        {unanswered > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#DC2626", color: "white" }}>답글 기다림 {unanswered}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
        같이가개에서 예약하고 이용한 손님의 별점 후기예요.<br />
        답글은 숙소 화면에 &ldquo;사장님 답글&rdquo;로 보이고, 문제 있는 후기는 신고하면 관리자가 검토해요.
      </div>
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {reviews === null && <div style={{ marginTop: 12, fontSize: 13, color: "#6e6e6e" }}>불러오는 중…</div>}
      {reviews?.length === 0 && <div style={{ marginTop: 12, fontSize: 13, color: "#6e6e6e" }}>아직 숙박 후기가 없어요.</div>}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {reviews?.map((r) => {
          const status = r.report_status ?? null;
          return (
            <div key={r.id} style={{ padding: "12px 13px", borderRadius: 12, border: `1px solid ${r.owner_reply ? "#eee" : "#F3D58A"}`, background: r.hidden ? "#f8f8f8" : "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} fill={i <= r.rating ? "#F59E0B" : "none"} color={i <= r.rating ? "#F59E0B" : "#d6d3c9"} />)}</span>
                <b style={{ fontSize: 13 }}>{r.guest_display_name ?? "손님"}</b>
                <span style={{ fontSize: 11.5, color: "#666" }}>{[r.room_name, r.nights ? `${r.nights}박` : null, r.pets_summary].filter(Boolean).join(" · ")}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#6e6e6e" }}>{stayDayLabel(r.created_at.slice(0, 10))}</span>
              </div>
              <div style={{ fontSize: 13.5, color: "#333", marginTop: 7, lineHeight: 1.7, whiteSpace: "pre-line" }}>{r.content}</div>
              {status && (
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 9, background: status === "pending" ? "#FEF3C7" : "#F1F5F9", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                  <b>신고 {REVIEW_REPORT_STATUS[status]}</b>
                  {r.report_reason && ` · ${REVIEW_REPORT_REASONS.find((x) => x.id === r.report_reason)?.label ?? r.report_reason}`}
                  {r.report_admin_note && <><br />관리자: {r.report_admin_note}</>}
                </div>
              )}
              {r.owner_reply && replyFor !== r.id && (
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#FFFBF0", fontSize: 12.5, color: "#555", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  <b style={{ color: "#B45309" }}>사장님 답글</b><br />{r.owner_reply}
                </div>
              )}

              {replyFor === r.id && (
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, OWNER_REPLY_MAX))} rows={3} autoFocus placeholder="손님께 감사 인사나 아쉬웠던 점에 대한 설명을 남겨 주세요." aria-label="사장님 답글" style={{ ...input, resize: "vertical", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => saveReply(r, reply)} disabled={busy || !reply.trim()} style={small("primary", busy || !reply.trim())}>답글 저장</button>
                    {r.owner_reply && <button onClick={() => window.confirm("답글을 지울까요?") && saveReply(r, "")} disabled={busy} style={small("danger")}>답글 지우기</button>}
                    <button onClick={() => setReplyFor(null)} style={small("plain")}>취소</button>
                  </div>
                </div>
              )}

              {reportFor === r.id && (
                <div style={{ display: "grid", gap: 6, marginTop: 8, padding: "10px 11px", borderRadius: 10, border: "1px solid #f3c7c5", background: "#FFF8F7" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#b42318" }}>후기 신고</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {REVIEW_REPORT_REASONS.map((x) => (
                      <button key={x.id} onClick={() => setReport((p) => ({ ...p, reason: x.id }))} aria-pressed={report.reason === x.id}
                        style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${report.reason === x.id ? "#b42318" : "#e2dcc8"}`, background: report.reason === x.id ? "#FEE2E2" : "white", color: report.reason === x.id ? "#b42318" : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{x.label}</button>
                    ))}
                  </div>
                  <textarea value={report.detail} onChange={(e) => setReport((p) => ({ ...p, detail: e.target.value.slice(0, 500) }))} rows={2} placeholder={report.reason === "etc" ? "신고 사유를 적어 주세요(필수)" : "관리자에게 전할 설명(선택) — 예: 실제 예약 내역과 다른 내용이에요"} aria-label="신고 설명" style={{ ...input, resize: "vertical" }} />
                  <div style={{ fontSize: 11.5, color: "#5c5c5c", lineHeight: 1.6 }}>관리자가 검토해 유지·가리기·삭제를 결정해요. 단순히 낮은 별점이라는 이유로는 가려지지 않아요.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => sendReport(r)} disabled={busy} style={{ ...small("primary", busy), background: busy ? "#d6d3c9" : "#b42318" }}>신고하기</button>
                    <button onClick={() => setReportFor(null)} style={small("plain")}>취소</button>
                  </div>
                </div>
              )}

              {canAct && replyFor !== r.id && reportFor !== r.id && !r.hidden && (
                <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                  <button onClick={() => { setReplyFor(r.id); setReply(r.owner_reply ?? ""); setReportFor(null); }} style={small(r.owner_reply ? "plain" : "primary")}>
                    <MessageCircle size={12} />{r.owner_reply ? "답글 고치기" : "답글 달기"}
                  </button>
                  {reportReady && !status && <button onClick={() => { setReportFor(r.id); setReport({ reason: "", detail: "" }); setReplyFor(null); }} style={small("danger")}><Flag size={12} />신고</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
