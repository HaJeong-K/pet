"use client";

// 관리자 신고 관리 — 장소 신고를 보고 그 자리에서 고치기(상호 변경·주소·전화·영업시간·분류 등).
// 신고 사유에 맞는 칸을 먼저 보여 주고, 지금 값과 다른 칸만 반영합니다. 반영하면 신고는 "반영"으로 닫힙니다.
// 서버는 /api/admin/report-fix(직접 등록 장소는 그 행을 고치고, 공공데이터 장소는 실제 행으로 올린 뒤 원래 번호를 숨김).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Field = "name" | "address" | "category" | "phone" | "hours" | "closed_days" | "pet_zone" | "website" | "parking" | "entry_fee";
const FIELDS: { key: Field; label: string; multiline?: boolean }[] = [
  { key: "name", label: "상호명" }, { key: "address", label: "주소" }, { key: "category", label: "분류" }, { key: "phone", label: "전화" },
  { key: "hours", label: "영업시간", multiline: true }, { key: "closed_days", label: "휴무일" }, { key: "pet_zone", label: "동반 범위" },
  { key: "website", label: "홈페이지" }, { key: "parking", label: "주차" }, { key: "entry_fee", label: "입장료" },
];
/** 신고 사유별로 먼저 볼 칸 */
const FOCUS: Record<string, Field[]> = {
  wrong_info: ["name", "address", "phone", "hours", "closed_days"],
  changed: ["name", "category"],
  no_pets: ["pet_zone"],
  different: ["hours", "closed_days", "pet_zone", "phone"],
};

const authed = async (path: string, init: RequestInit = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
};

export default function ReportFixPanel({ reportId, placeId, category, reason, onDone }: { reportId: number; placeId: number; category?: string | null; reason?: string | null; onDone: (changed: string[]) => void }) {
  const [orig, setOrig] = useState<Record<Field, string> | null>(null);
  const [form, setForm] = useState<Record<Field, string> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let off = false;
    authed(`/api/admin/report-fix?placeId=${placeId}`).then((j) => { if (!off) { setOrig(j.place); setForm(j.place); } }).catch((e) => !off && setMsg({ ok: false, text: e.message }));
    return () => { off = true; };
  }, [placeId]);

  const focus = FOCUS[category ?? ""] ?? [];
  const shown = showAll || focus.length === 0 ? FIELDS : FIELDS.filter((f) => focus.includes(f.key));
  const changed = form && orig ? FIELDS.filter((f) => form[f.key].trim() && form[f.key].trim() !== String(orig[f.key] ?? "").trim()) : [];

  const save = async () => {
    if (!form || changed.length === 0 || busy) return;
    if (!window.confirm(`${changed.map((f) => f.label).join("·")}을(를) 고치고 신고를 "반영"으로 닫을까요?`)) return;
    setBusy(true); setMsg(null);
    try {
      const j = await authed("/api/admin/report-fix", { method: "POST", body: JSON.stringify({ reportId, placeId, fields: form }) });
      setMsg({ ok: true, text: j.mode === "graduated_public_data" ? "고쳤어요. 공공데이터 장소라 고친 내용으로 새 장소를 만들고 원래 장소는 숨겼어요." : "고쳤어요." });
      onDone(j.changed ?? []);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: 14, borderRadius: 14, background: "#FCFAF8", border: "1px solid #EADBD0", display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>신고 내용 보고 고치기</div>
      {reason && <div style={{ fontSize: 13, color: "#2A1C14", lineHeight: 1.6, padding: "9px 11px", borderRadius: 10, background: "white", border: "1px solid #EDECEB" }}><b>신고 내용</b> · {reason}</div>}
      {!form ? (
        <div style={{ fontSize: 13, color: "#2A1C14" }}>{msg?.text ?? "장소 정보를 불러오는 중…"}</div>
      ) : (
        <>
          {shown.map((f) => {
            const dirty = form[f.key].trim() !== String(orig?.[f.key] ?? "").trim() && form[f.key].trim() !== "";
            const common = { value: form[f.key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((v) => (v ? { ...v, [f.key]: e.target.value } : v)), "aria-label": f.label, style: { width: "100%", boxSizing: "border-box" as const, padding: "9px 11px", borderRadius: 9, border: `1px solid ${dirty ? "#A05A32" : "#D9D8D7"}`, background: dirty ? "#FFF8F3" : "white", fontSize: 13.5, fontFamily: "inherit", color: "#111" } };
            return (
              <label key={f.key} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#2A1C14" }}>{f.label}{dirty && <span style={{ color: "#A05A32" }}> · 바꿈 (지금: {orig?.[f.key] || "비어 있음"})</span>}</span>
                {f.multiline ? <textarea rows={3} {...common} style={{ ...common.style, resize: "vertical" }} /> : <input {...common} />}
              </label>
            );
          })}
          {focus.length > 0 && <button onClick={() => setShowAll((v) => !v)} style={{ justifySelf: "start", border: "none", background: "transparent", padding: 0, color: "#A05A32", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{showAll ? "신고 사유에 맞는 칸만 보기" : "다른 칸도 고치기"}</button>}
          <button onClick={save} disabled={busy || changed.length === 0} style={{ padding: "11px 0", borderRadius: 11, border: "none", background: busy || changed.length === 0 ? "#D4D3D2" : "#3B2A20", color: busy || changed.length === 0 ? "#4f4a3f" : "white", fontSize: 13.5, fontWeight: 800, cursor: busy || changed.length === 0 ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "반영하는 중…" : changed.length ? `${changed.map((f) => f.label).join("·")} 반영하고 신고 닫기` : "바꿀 칸을 고쳐 주세요"}
          </button>
          {msg && <div role="status" style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? "#85482A" : "#b91c1c" }}>{msg.text}</div>}
        </>
      )}
    </div>
  );
}
