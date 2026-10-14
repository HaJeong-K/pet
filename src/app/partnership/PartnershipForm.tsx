"use client";

// 광고·제휴 문의 양식 — 보내면 관리자 문의함(/admin/inquiries)에 쌓이고 관리자에게 알림이 갑니다.
// 로그인하지 않아도 보낼 수 있습니다(로그인했으면 계정도 함께 남김).

import { useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cleanInquiry, INQUIRY_KINDS, INQUIRY_MESSAGE_MAX, type InquiryKind } from "@/lib/partnerInquiry";

const CONTACT_EMAIL = "infoker12@naver.com";
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6 };

export default function PartnershipForm() {
  const [form, setForm] = useState<{ kind: InquiryKind; name: string; company: string; contact: string; message: string; website: string }>({ kind: "ad", name: "", company: "", contact: "", message: "", website: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const cleaned = cleanInquiry(form);
    if ("error" in cleaned) { setError(cleaned.error); return; }
    if (!agree) { setError("연락처 수집·이용에 동의해 주세요."); return; }
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "문의를 보내지 못했어요.");
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "문의를 보내지 못했어요."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div id="inquiry" style={{ marginTop: 20, background: "white", borderRadius: 22, border: "1px solid #bbf7d0", padding: "34px 18px", textAlign: "center", scrollMarginTop: 70 }}>
        <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#15803D" }}>문의를 잘 받았어요</div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#555", lineHeight: 1.7 }}>적어 주신 연락처로 답을 드릴게요. 보통 영업일 기준 2~3일 안에 연락드려요.</div>
      </div>
    );
  }

  return (
    <div id="inquiry" style={{ marginTop: 20, background: "white", borderRadius: 22, border: "1px solid #ece6d6", padding: "clamp(18px, 4vw, 28px)", boxShadow: "0 8px 28px rgba(60,50,20,0.06)", scrollMarginTop: 70 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <span style={label}>문의 종류</span>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {INQUIRY_KINDS.map((k) => {
              const active = form.kind === k.id;
              return <button key={k.id} onClick={() => setForm({ ...form, kind: k.id })} aria-pressed={active} title={k.hint} style={{ padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${active ? "#5C7A4A" : "#e2e4e8"}`, background: active ? "#E4EBDC" : "white", color: active ? "#3F5230" : "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{k.label}</button>;
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: "#999" }}>{INQUIRY_KINDS.find((k) => k.id === form.kind)?.hint}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label><span style={label}>담당자 이름</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} style={input} /></label>
          <label><span style={label}>회사·가게 이름 <span style={{ fontWeight: 600, color: "#aaa" }}>(선택)</span></span><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={60} style={input} /></label>
        </div>
        <label><span style={label}>답을 받을 연락처</span><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} maxLength={100} placeholder="이메일 주소 또는 전화번호" style={input} /></label>
        <label>
          <span style={label}>문의 내용 <span style={{ fontWeight: 600, color: "#aaa" }}>{form.message.length}/{INQUIRY_MESSAGE_MAX}</span></span>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={INQUIRY_MESSAGE_MAX} rows={6} placeholder="알리고 싶은 가게·브랜드·상품, 원하는 방식(배너·체험 행사 등), 지역과 기간, 예산을 적어 주시면 더 빨리 안내해 드릴 수 있어요." style={{ ...input, resize: "vertical", lineHeight: 1.6 }} />
        </label>
        {/* 사람에게는 보이지 않는 칸(자동 입력 걸러 내기용) */}
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#555", lineHeight: 1.6, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0 }} />
          <span>문의에 답하기 위해 이름·회사 이름·연락처를 수집하고, 답을 드린 뒤 1년 동안 보관하는 데 동의해요.</span>
        </label>
        {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
        <button onClick={submit} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", borderRadius: 11, border: "none", background: busy ? "#cbd5c0" : "#5C7A4A", color: "white", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
          <Send size={15} />{busy ? "보내는 중…" : "문의 보내기"}
        </button>
        <div style={{ fontSize: 11.5, color: "#999", lineHeight: 1.6 }}>양식이 잘 보내지지 않으면 {CONTACT_EMAIL}로 메일을 보내 주세요.</div>
      </div>
    </div>
  );
}
