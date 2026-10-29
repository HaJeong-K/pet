"use client";

// 관리자 "숙박 예약 → 입점 영업" — 아직 입점하지 않은 반려동물 동반 숙소에 전화로 입점을 안내하는 영업 리스트입니다.
//   · 검색(이름·지역), 상태 걸러 보기(연락 전·연락함·관심 있음·거절·입점함)
//   · 숙소마다 전화 걸기, 연락 상태와 메모 저장(마지막 연락일 표시), 입점 신청·승인된 곳은 표시
// 서버는 /api/admin/lodging-leads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LogoLoader from "@/components/LogoLoader";

type LeadStatus = "todo" | "contacted" | "interested" | "declined" | "joined";
type Lead = {
  id: number; name: string; category: string | null; address: string | null; phone: string;
  lead: { status: LeadStatus; memo: string | null; contacted_at: string | null; updated_at: string } | null;
  partnerStatus: string | null;
};
const STATUS: Record<LeadStatus, { label: string; bg: string; color: string }> = {
  todo: { label: "연락 전", bg: "#F1F5F9", color: "#475569" },
  contacted: { label: "연락함", bg: "#DBEAFE", color: "#1D4ED8" },
  interested: { label: "관심 있음", bg: "#FEF3C7", color: "#92400E" },
  declined: { label: "거절", bg: "#FEE2E2", color: "#991B1B" },
  joined: { label: "입점함", bg: "#DCFCE7", color: "#166534" },
};
const card: React.CSSProperties = { background: "white", borderRadius: 14, border: "1px solid #ece6d6", padding: "12px 14px" };
const PAGE = 40;

export default function LeadsView() {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [ready, setReady] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ status: LeadStatus; memo: string }>({ status: "contacted", memo: "" });
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch("/api/admin/lodging-leads", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { const j = await call(); setReady(j.ready !== false); setRows(j.leads ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setRows([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const statusOf = (r: Lead): LeadStatus => r.lead?.status ?? "todo";
  const list = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    return (rows ?? []).filter((r) => (filter === "all" || statusOf(r) === filter) && (!q || `${r.name}${r.address ?? ""}`.replace(/\s+/g, "").includes(q)));
  }, [rows, query, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[statusOf(r)] = (c[statusOf(r)] ?? 0) + 1;
    return c;
  }, [rows]);

  const save = async (r: Lead) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await call({ method: "POST", body: JSON.stringify({ placeId: r.id, ...draft }) });
      setRows((all) => (all ?? []).map((x) => (x.id === r.id ? { ...x, lead: { status: draft.status, memo: draft.memo.trim() || null, contacted_at: draft.status !== "todo" ? new Date().toISOString() : x.lead?.contacted_at ?? null, updated_at: new Date().toISOString() } } : x)));
      setEditing(null);
      setMessage({ ok: true, text: `${r.name} — ${STATUS[draft.status].label}(으)로 저장했어요.` });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {!ready && <div style={{ ...card, color: "#9a3412", fontSize: 13 }}>Supabase SQL 편집기에서 <b>scripts/sql/lodging-operations.sql</b>을 실행하면 연락 상태·메모를 저장할 수 있어요.</div>}
      <div style={{ ...card, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e0d0" }}>
          <Search size={15} color="#999" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="숙소 이름이나 지역 — 예: 강릉, 가평" aria-label="영업 리스트 검색" style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, fontFamily: "inherit" }} />
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {(["all", "todo", "contacted", "interested", "declined", "joined"] as const).map((k) => (
            <button key={k} onClick={() => { setFilter(k); setLimit(PAGE); }} aria-pressed={filter === k}
              style={{ padding: "6px 11px", borderRadius: 999, border: "none", background: filter === k ? "#5C7A4A" : "#F4F1E8", color: filter === k ? "white" : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {k === "all" ? "전체" : STATUS[k].label} {counts[k] ?? 0}
            </button>
          ))}
        </div>
      </div>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {rows === null && <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>}
      {rows && list.length === 0 && <div style={{ ...card, textAlign: "center", color: "#aaa", fontSize: 13 }}>조건에 맞는 숙소가 없어요.</div>}
      {list.slice(0, limit).map((r) => {
        const st = STATUS[statusOf(r)];
        return (
          <div key={r.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
              <b style={{ fontSize: 14 }}>{r.name}</b>
              {r.category && <span style={{ fontSize: 11.5, color: "#888" }}>{r.category}</span>}
              {r.partnerStatus && <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#E3EDFA", color: "#1D4F91" }}>입점 {r.partnerStatus === "approved" ? "승인" : r.partnerStatus === "pending" ? "심사 중" : "반려"}</span>}
              <a href={`/place/${r.id}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "#1D4F91" }}>장소 보기</a>
            </div>
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 4 }}>{r.address ?? "주소 없음"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <a href={`tel:${r.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 11px", borderRadius: 9, background: "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}><Phone size={12} />{r.phone}</a>
              <button onClick={() => { setEditing(editing === r.id ? null : r.id); setDraft({ status: r.lead?.status && r.lead.status !== "todo" ? r.lead.status : "contacted", memo: r.lead?.memo ?? "" }); }} style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 12.5, fontWeight: 700, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>연락 기록</button>
              {r.lead?.contacted_at && <span style={{ fontSize: 11.5, color: "#999" }}>마지막 연락 {r.lead.contacted_at.slice(0, 10)}</span>}
            </div>
            {r.lead?.memo && editing !== r.id && <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 9, background: "#F7F3E8", fontSize: 12.5, color: "#555", whiteSpace: "pre-line" }}>{r.lead.memo}</div>}
            {editing === r.id && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {(Object.keys(STATUS) as LeadStatus[]).map((k) => (
                    <button key={k} onClick={() => setDraft((d) => ({ ...d, status: k }))} aria-pressed={draft.status === k}
                      style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${draft.status === k ? STATUS[k].color : "#e2e4e8"}`, background: draft.status === k ? STATUS[k].bg : "white", color: draft.status === k ? STATUS[k].color : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{STATUS[k].label}</button>
                  ))}
                </div>
                <textarea value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value.slice(0, 1000) }))} rows={2} placeholder="메모 — 예: 사장님 부재, 다음 주 화요일 다시 연락 / 수수료 문의함" style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 12.5, boxSizing: "border-box", fontFamily: "inherit" }} />
                <button onClick={() => save(r)} disabled={busy} style={{ justifySelf: "start", padding: "8px 14px", borderRadius: 9, border: "none", background: busy ? "#d6d3c9" : "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>저장</button>
              </div>
            )}
          </div>
        );
      })}
      {list.length > limit && <button onClick={() => setLimit((n) => n + PAGE)} style={{ padding: "11px 0", borderRadius: 12, border: "1px solid #5C7A4A", background: "white", color: "#5C7A4A", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>더 보기 ({list.length - limit}곳 남음)</button>}
    </>
  );
}
