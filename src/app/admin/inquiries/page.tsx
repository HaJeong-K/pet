"use client";

// ── 광고·제휴 문의함 ──
// 사이트 아래 "광고·제휴 문의"(/partnership)로 들어온 글을 봅니다. 새 문의가 오면 카카오톡·앱 알림으로도 알려 줍니다.
// 답은 문의에 적힌 연락처(이메일·전화)로 직접 하고, 끝나면 "처리 완료"로 넘겨 둡니다.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import LogoLoader from "@/components/LogoLoader";
import { AdminPager, usePaged } from "@/components/admin/AdminListTools";
import { Handshake, Mail, Phone } from "lucide-react";
import { inquiryKindLabel } from "@/lib/partnerInquiry";

type Inquiry = { id: number; kind: string; name: string; company: string | null; contact: string; message: string; status: "new" | "done"; admin_note: string | null; created_at: string; processed_at: string | null };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/inquiries", { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}
const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND_COLOR: Record<string, { bg: string; color: string }> = { ad: { bg: "#f3f0ff", color: "#7c3aed" }, partner: { bg: "#DBEAFE", color: "#1D4ED8" }, etc: { bg: "#f1f2f4", color: "#555" } };

export default function AdminInquiries() {
  const [state, setState] = useState<{ ready: boolean; inquiries: Inquiry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "done">("new");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    try { setState(await call("GET")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setState((prev) => prev ?? { ready: true, inquiries: [] }); }
  };
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, []);

  const mark = async (inquiry: Inquiry, status: "new" | "done") => {
    if (busyId != null) return;
    let note: string | undefined;
    if (status === "done") {
      const typed = window.prompt("처리 메모를 남겨 두세요(선택) — 예: 10/15 메일로 요금 안내함", inquiry.admin_note ?? "");
      if (typed === null) return;
      note = typed;
    }
    setBusyId(inquiry.id);
    try { await call("POST", { id: inquiry.id, status, note }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };

  const list = (state?.inquiries ?? []).filter((i) => i.status === filter);
  const pager = usePaged(list, filter);
  const fresh = (state?.inquiries ?? []).filter((i) => i.status === "new").length;

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="inquiries" onRefresh={load} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Handshake size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>광고·제휴 문의</div>
          <a href="/partnership" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#5C7A4A" }}>방문자 화면 보기 →</a>
        </div>
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.7, marginBottom: 14 }}>사이트 아래 &ldquo;광고·제휴 문의&rdquo;로 들어온 글이에요. 답은 적힌 연락처로 직접 하고, 끝나면 처리 완료로 넘겨 두세요.</div>

        <div style={{ display: "flex", background: "#e8eaed", borderRadius: 12, padding: 3, gap: 3, marginBottom: 14 }}>
          {([{ key: "new", label: `새 문의 ${fresh}` }, { key: "done", label: "처리 완료" }] as const).map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", background: filter === tab.key ? "white" : "transparent", fontWeight: 700, fontSize: 12.5, color: filter === tab.key ? "#111" : "#888", cursor: "pointer", fontFamily: "inherit" }}>{tab.label}</button>
          ))}
        </div>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 12 }}>{error}</div>}
        {state === null ? (
          <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>
        ) : !state.ready ? (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.7 }}>문의를 저장할 표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/banner-ads.sql</b>을 실행하면 열려요.</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 28, borderRadius: 12, background: "white", border: "1px solid #eee", fontSize: 13, color: "#888", textAlign: "center" }}>{filter === "new" ? "새 문의가 없어요." : "처리한 문의가 없어요."}</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10 }}>
              {pager.items.map((i) => {
                const isEmail = i.contact.includes("@");
                return (
                  <div key={i.id} style={{ background: "white", borderRadius: 14, border: `1px solid ${i.status === "new" ? "#f3d9a4" : "#eee"}`, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: (KIND_COLOR[i.kind] ?? KIND_COLOR.etc).bg, color: (KIND_COLOR[i.kind] ?? KIND_COLOR.etc).color }}>{inquiryKindLabel(i.kind)}</span>
                      <b style={{ fontSize: 14, color: "#111" }}>{i.company ? `${i.company} · ${i.name}` : i.name}</b>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>{fmt(i.created_at)}</span>
                    </div>
                    <a href={isEmail ? `mailto:${i.contact}` : `tel:${i.contact.replace(/[^\d+]/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7, fontSize: 13, fontWeight: 700, color: "#3F5230", textDecoration: "none" }}>
                      {isEmail ? <Mail size={13} /> : <Phone size={13} />}{i.contact}
                    </a>
                    <div style={{ marginTop: 9, fontSize: 13, color: "#444", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{i.message}</div>
                    {i.admin_note && <div style={{ marginTop: 9, fontSize: 12, color: "#666", background: "#fafafa", border: "1px solid #eee", borderRadius: 9, padding: "7px 10px", whiteSpace: "pre-wrap" }}>메모: {i.admin_note}</div>}
                    <div style={{ marginTop: 11 }}>
                      {i.status === "new"
                        ? <button disabled={busyId === i.id} onClick={() => mark(i, "done")} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>처리 완료로 넘기기</button>
                        : <button disabled={busyId === i.id} onClick={() => mark(i, "new")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", color: "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>새 문의로 되돌리기</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            <AdminPager pager={pager} />
          </>
        )}
      </div>
    </div>
  );
}
