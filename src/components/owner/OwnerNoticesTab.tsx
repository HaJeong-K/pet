"use client";

// 사장님 센터 "공지" — 가게 상세 화면(지도 위 상세 창 포함)의 친화도 점수 바로 아래에 보이는 공지를 씁니다.
//   · 새 공지: 제목·내용, "대표 공지로 고정"(한 가게에 하나 — 새로 고정하면 예전 고정은 풀림)
//   · 올린 공지: 고치기 · 고정/해제 · 지우기(손님에게 안 보이고 기록은 남음)
//   · 예: 휴무 안내, 이벤트, 메뉴·요금 변경, 반려동물 동반 규정 변경
// 서버는 /api/owner/notices, 규칙은 src/lib/placeNotices.ts.

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NOTICE_CONTENT_MAX, NOTICE_TITLE_MAX, noticeDate, type PlaceNotice } from "@/lib/placeNotices";

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const small = (danger = false): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 10px", borderRadius: 9, border: `1px solid ${danger ? "#f3c7c5" : "#e2dcc8"}`, background: "white", color: danger ? "#b42318" : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const EMPTY = { title: "", content: "", pinned: false };

export default function OwnerNoticesTab({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [notices, setNotices] = useState<PlaceNotice[] | null>(null);
  const [ready, setReady] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init: RequestInit = {}, extra = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    // 관리자가 다른 가게를 볼 때만 주소에 가게 번호를 붙입니다(사장님 본인은 서버가 본인 가게로 고정).
    const query = [isPreview ? `placeId=${placeId}` : "", extra].filter(Boolean).join("&");
    const res = await fetch(`/api/owner/notices${query ? `?${query}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  const load = useCallback(async () => {
    try { const json = await call(); setReady(json.ready !== false); setNotices(json.notices ?? []); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setNotices([]); }
  }, [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try { await work(); setMessage({ ok: true, text: done }); await load(); return true; }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); return false; }
    finally { setBusy(false); }
  };
  const save = async () => {
    const ok = await run(
      () => call({ method: editId ? "PATCH" : "POST", body: JSON.stringify(editId ? { id: editId, ...form } : form) }),
      editId ? "공지를 고쳤어요." : "공지를 올렸어요. 가게 상세 화면에 바로 보여요.",
    );
    if (ok) { setForm(EMPTY); setEditId(null); }
  };
  const edit = (n: PlaceNotice) => { setEditId(n.id); setForm({ title: n.title, content: n.content, pinned: n.pinned }); setMessage(null); };
  const remove = (n: PlaceNotice) => {
    if (!window.confirm(`"${n.title}" 공지를 지울까요?\n손님 화면에서 사라져요.`)) return;
    run(() => call({ method: "DELETE" }, `id=${n.id}`), "공지를 지웠어요.");
    if (editId === n.id) { setEditId(null); setForm(EMPTY); }
  };
  const togglePin = (n: PlaceNotice) => run(() => call({ method: "PATCH", body: JSON.stringify({ id: n.id, pinned: !n.pinned }) }), n.pinned ? "고정을 풀었어요." : "대표 공지로 고정했어요.");
  const disabled = !canAct || busy || !ready;
  const formReady = form.title.trim() && form.content.trim() && !disabled;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Megaphone size={17} color="#B45309" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>{editId ? "공지 고치기" : "새 공지 쓰기"}</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#777", marginTop: 6, lineHeight: 1.7 }}>
          가게 상세 화면의 친화도 점수 바로 아래에 보입니다.<br />
          휴무 안내, 이벤트, 메뉴·요금 변경, 반려동물 동반 규정 변경을 알려 주세요.
        </div>
        {!ready && <div style={{ marginTop: 10, fontSize: 12.5, color: "#9a3412" }}>공지 기능을 준비 중이에요(관리자: scripts/sql/place-notices.sql 실행).</div>}
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, NOTICE_TITLE_MAX) }))} disabled={disabled} placeholder="제목 — 예: 11월 3일(월) 정기 휴무 안내" aria-label="공지 제목" style={input} />
          <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value.slice(0, NOTICE_CONTENT_MAX) }))} disabled={disabled} rows={5} placeholder={"내용 — 예: 11월 3일(월)은 정기 휴무입니다.\n4일(화)부터 정상 영업해요."} aria-label="공지 내용" style={{ ...input, resize: "vertical", lineHeight: 1.6 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#444", cursor: "pointer" }}>
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} disabled={disabled} style={{ width: 16, height: 16 }} />
              대표 공지로 고정(맨 위에 보임)
            </label>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#aaa" }}>{form.content.length}/{NOTICE_CONTENT_MAX}자</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {editId && <button onClick={() => { setEditId(null); setForm(EMPTY); }} style={{ ...small(), padding: "12px 16px" }}>취소</button>}
            <button onClick={save} disabled={!formReady} style={{ flex: 1, padding: "12px 0", borderRadius: 11, border: "none", background: formReady ? "#B45309" : "#d6d3c9", color: "white", fontSize: 14, fontWeight: 800, cursor: formReady ? "pointer" : "default", fontFamily: "inherit" }}>
              {busy ? "저장하는 중…" : editId ? "고친 내용 저장" : "공지 올리기"}
            </button>
          </div>
          {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
          {!canAct && <div style={{ fontSize: 12, color: "#999" }}>보기 전용이에요.</div>}
        </div>
      </div>

      <div style={card}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>올린 공지 {notices ? notices.length : ""}</div>
        {notices?.length === 0 && <div style={{ marginTop: 10, fontSize: 13, color: "#aaa" }}>아직 올린 공지가 없어요.</div>}
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {notices?.map((n) => (
            <div key={n.id} style={{ padding: "12px 13px", borderRadius: 12, border: `1px solid ${n.pinned ? "#F3D58A" : "#eee"}`, background: n.pinned ? "#FFFBF0" : "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {n.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, color: "#B45309" }}><Pin size={11} />대표</span>}
                <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</b>
                <span style={{ fontSize: 11.5, color: "#aaa" }}>{noticeDate(n.created_at)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#666", marginTop: 5, lineHeight: 1.6, whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.content}</div>
              {canAct && (
                <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                  <button onClick={() => edit(n)} disabled={busy} style={small()}><Pencil size={12} />고치기</button>
                  <button onClick={() => togglePin(n)} disabled={busy} style={small()}>{n.pinned ? <><PinOff size={12} />고정 풀기</> : <><Pin size={12} />대표로 고정</>}</button>
                  <button onClick={() => remove(n)} disabled={busy} style={small(true)}><Trash2 size={12} />지우기</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
