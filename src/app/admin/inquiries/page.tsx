"use client";

// ── 광고·제휴 문의함 ──
// 사이트 아래 "광고·제휴 문의"(/partnership)로 들어온 글을 관리합니다. 새 문의가 오면 카카오톡·앱 알림으로도 알려 줍니다.
//   · 목록에는 한 줄 요약만 보이고, 누르면 펼쳐져 전체 내용·연락처·메모가 보입니다.
//   · 처리 상태: 접수 → 협의 필요 → 진행 중 → 완료 / 반려 (언제든 바꿀 수 있음)
//   · 메모: 통화 내용·견적·다음에 할 일을 문의마다 적어 둡니다(관리자만 봄).
// 답은 문의에 적힌 연락처(이메일·전화)로 직접 합니다.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import LogoLoader from "@/components/LogoLoader";
import { AdminPager, usePaged } from "@/components/admin/AdminListTools";
import { ChevronDown, ChevronUp, Handshake, Mail, Phone } from "lucide-react";
import { INQUIRY_NOTE_MAX, INQUIRY_STATUSES, inquiryKindLabel, inquiryStatus, type InquiryStatus } from "@/lib/partnerInquiry";

type Inquiry = { id: number; kind: string; name: string; company: string | null; contact: string; message: string; status: InquiryStatus; admin_note: string | null; created_at: string; processed_at: string | null };
type Filter = "all" | InquiryStatus;

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/inquiries", { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}
const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtShort = (s: string) => new Date(s).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
const KIND_COLOR: Record<string, { bg: string; color: string }> = { ad: { bg: "#f3f0ff", color: "#7c3aed" }, partner: { bg: "#DBEAFE", color: "#1D4ED8" }, etc: { bg: "#f1f2f4", color: "#555" } };
const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: bg, color, flexShrink: 0, whiteSpace: "nowrap" });

function InquiryRow({ inquiry, open, onToggle, onChanged }: { inquiry: Inquiry; open: boolean; onToggle: () => void; onChanged: (patch: Partial<Inquiry>) => void }) {
  const [note, setNote] = useState(inquiry.admin_note ?? "");
  const [busy, setBusy] = useState<"" | "status" | "note">("");
  const [saved, setSaved] = useState(false);
  const status = inquiryStatus(inquiry.status);
  const kind = KIND_COLOR[inquiry.kind] ?? KIND_COLOR.etc;
  const isEmail = inquiry.contact.includes("@");
  const noteDirty = note.trim() !== (inquiry.admin_note ?? "");

  const setStatus = async (next: InquiryStatus) => {
    if (busy || next === inquiry.status) return;
    setBusy("status");
    try { await call("POST", { id: inquiry.id, status: next }); onChanged({ status: next }); }
    catch (e) { alert(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusy(""); }
  };
  const saveNote = async () => {
    if (busy || !noteDirty) return;
    setBusy("note");
    try { await call("POST", { id: inquiry.id, note }); onChanged({ admin_note: note.trim() || null }); setSaved(true); window.setTimeout(() => setSaved(false), 2000); }
    catch (e) { alert(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ background: "white", borderRadius: 14, border: `1px solid ${open ? "#d8cfae" : inquiry.status === "new" ? "#f3d9a4" : "#eee"}`, overflow: "hidden" }}>
      {/* 한 줄 요약 — 누르면 펼쳐집니다 */}
      <button onClick={onToggle} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={chip(status.bg, status.color)}>{status.label}</span>
        <span style={chip(kind.bg, kind.color)}>{inquiryKindLabel(inquiry.kind)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inquiry.company ? `${inquiry.company} · ${inquiry.name}` : inquiry.name}</span>
          {!open && <span style={{ display: "block", fontSize: 12, color: "#888", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inquiry.message.replace(/\s+/g, " ")}</span>}
        </span>
        {inquiry.admin_note && !open && <span style={chip("#f5f6f8", "#777")}>메모</span>}
        <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0 }}>{fmtShort(inquiry.created_at)}</span>
        {open ? <ChevronUp size={16} color="#888" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="#888" style={{ flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ padding: "2px 14px 16px", borderTop: "1px solid #f3efe2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <a href={isEmail ? `mailto:${inquiry.contact}` : `tel:${inquiry.contact.replace(/[^\d+]/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, background: "#E4EBDC", fontSize: 13, fontWeight: 800, color: "#3F5230", textDecoration: "none" }}>
              {isEmail ? <Mail size={13} /> : <Phone size={13} />}{inquiry.contact}
            </a>
            <span style={{ fontSize: 11.5, color: "#999" }}>{fmt(inquiry.created_at)} 접수{inquiry.processed_at ? ` · ${fmt(inquiry.processed_at)} 마침` : ""}</span>
          </div>

          <div style={{ marginTop: 12, padding: "12px 13px", borderRadius: 11, background: "#FBF8EF", fontSize: 13.5, color: "#333", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{inquiry.message}</div>

          <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 800, color: "#444" }}>처리 상태</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            {INQUIRY_STATUSES.map((s) => {
              const active = s.id === inquiry.status;
              return (
                <button key={s.id} onClick={() => setStatus(s.id)} disabled={busy !== ""} aria-pressed={active} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${active ? s.color : "#e2e4e8"}`, background: active ? s.bg : "white", color: active ? s.color : "#666", fontSize: 12.5, fontWeight: 800, cursor: active ? "default" : "pointer", fontFamily: "inherit" }}>{s.label}</button>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "#444" }}>
            관리자 메모 <span style={{ fontWeight: 600, color: "#aaa" }}>나만 봐요 · {note.length}/{INQUIRY_NOTE_MAX}</span>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={INQUIRY_NOTE_MAX} rows={4} placeholder={"통화 내용, 보낸 견적, 다음에 할 일을 적어 두세요.\n예: 10/15 통화 — 11월 한 달 배너 원함, 견적서 메일로 보냄. 10/20까지 답 기다리기"} style={{ width: "100%", marginTop: 7, padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13.5, lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <button onClick={saveNote} disabled={busy !== "" || !noteDirty} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: noteDirty ? "#5C7A4A" : "#d6d3c9", color: "white", fontSize: 12.5, fontWeight: 800, cursor: noteDirty ? "pointer" : "default", fontFamily: "inherit" }}>{busy === "note" ? "저장 중…" : "메모 저장"}</button>
            {saved && <span role="status" style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>저장했어요</span>}
            {noteDirty && !saved && <span style={{ fontSize: 12, color: "#B45309" }}>저장하지 않은 내용이 있어요</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminInquiries() {
  const [state, setState] = useState<{ ready: boolean; inquiries: Inquiry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("new");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = async () => {
    try { setState(await call("GET")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setState((prev) => prev ?? { ready: true, inquiries: [] }); }
  };
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, []);

  const all = state?.inquiries ?? [];
  const countOf = (id: Filter) => (id === "all" ? all.length : all.filter((i) => i.status === id).length);
  // 상태를 바꾼 문의가 펼쳐 둔 채로 목록에서 바로 사라지지 않게, 펼쳐 둔 것은 지금 보는 상태가 아니어도 남겨 둡니다.
  const list = all.filter((i) => filter === "all" || i.status === filter || i.id === openId);
  const pager = usePaged(list, filter);
  const patch = (id: number, change: Partial<Inquiry>) => setState((prev) => (prev ? { ...prev, inquiries: prev.inquiries.map((i) => (i.id === id ? { ...i, ...change } : i)) } : prev));
  const tabs: { id: Filter; label: string; bg: string; color: string }[] = [...INQUIRY_STATUSES.map((s) => ({ id: s.id as Filter, label: s.label, bg: s.bg, color: s.color })), { id: "all", label: "전체", bg: "#f1f2f4", color: "#444" }];

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="inquiries" onRefresh={load} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Handshake size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>광고·제휴 문의</div>
          <a href="/partnership" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#5C7A4A" }}>방문자 화면 보기 →</a>
        </div>
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.7, marginBottom: 14 }}>문의를 누르면 전체 내용이 펼쳐져요. 답은 적힌 연락처로 직접 하고, 진행 상황에 맞게 상태를 바꾸고 메모를 남겨 두세요.</div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {tabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button key={tab.id} onClick={() => { setFilter(tab.id); setOpenId(null); }} aria-pressed={active} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, border: `1.5px solid ${active ? tab.color : "transparent"}`, background: active ? tab.bg : "white", color: active ? tab.color : "#666", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {tab.label}<span style={{ fontSize: 11, fontWeight: 800, opacity: 0.8 }}>{countOf(tab.id)}</span>
              </button>
            );
          })}
        </div>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 12 }}>{error}</div>}
        {state === null ? (
          <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>
        ) : !state.ready ? (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.7 }}>문의를 저장할 표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/banner-ads.sql</b>을 실행하면 열려요.</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 28, borderRadius: 12, background: "white", border: "1px solid #eee", fontSize: 13, color: "#888", textAlign: "center" }}>{filter === "all" ? "아직 들어온 문의가 없어요." : `'${tabs.find((t) => t.id === filter)?.label}' 상태인 문의가 없어요.`}</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8 }}>
              {pager.items.map((i) => <InquiryRow key={i.id} inquiry={i} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} onChanged={(change) => patch(i.id, change)} />)}
            </div>
            <AdminPager pager={pager} />
          </>
        )}
      </div>
    </div>
  );
}
