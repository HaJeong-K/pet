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
    if (!agree) { setError("개인정보 수집·이용에 동의해 주세요."); return; }
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
      if (!res.ok) throw new Error(json.error || "문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div id="inquiry" style={{ marginTop: 20, background: "white", borderRadius: 22, border: "1px solid #bbf7d0", padding: "34px 18px", textAlign: "center", scrollMarginTop: 70 }}>
        <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#15803D" }}>문의가 접수되었습니다</div>
        <div style={{ marginTop: 10, fontSize: 13.5, color: "#555", lineHeight: 1.8, whiteSpace: "pre-line" }}>{`남겨 주신 연락처로 회신드리겠습니다.
영업일 기준 2~3일 안에 연락드립니다.`}</div>
      </div>
    );
  }

  return (
    <div id="inquiry" style={{ marginTop: 20, background: "white", borderRadius: 22, border: "1px solid #ece6d6", padding: "clamp(18px, 4vw, 28px)", boxShadow: "0 8px 28px rgba(60,50,20,0.06)", scrollMarginTop: 70 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <span style={label}>문의 유형</span>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {INQUIRY_KINDS.map((k) => {
              const active = form.kind === k.id;
              return <button key={k.id} onClick={() => setForm({ ...form, kind: k.id })} aria-pressed={active} title={k.hint} style={{ padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${active ? "#5C7A4A" : "#e2e4e8"}`, background: active ? "#E4EBDC" : "white", color: active ? "#3F5230" : "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{k.label}</button>;
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: "#999" }}>{INQUIRY_KINDS.find((k) => k.id === form.kind)?.hint}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label><span style={label}>담당자명</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} style={input} /></label>
          <label><span style={label}>회사명 <span style={{ fontWeight: 600, color: "#aaa" }}>(선택)</span></span><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={60} style={input} /></label>
        </div>
        <label><span style={label}>연락처</span><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} maxLength={100} placeholder="회신받을 이메일 또는 전화번호" style={input} /></label>
        <label>
          <span style={label}>문의 내용 <span style={{ fontWeight: 600, color: "#aaa" }}>{form.message.length}/{INQUIRY_MESSAGE_MAX}</span></span>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={INQUIRY_MESSAGE_MAX} rows={8} placeholder={`아래 내용을 기재해 주시면 더 빠르게 안내드릴 수 있습니다.

· 홍보 대상 (매장·브랜드·상품)
· 희망 방식 (배너, 체험 프로모션 등)
· 희망 지역과 기간
· 예산 범위`} style={{ ...input, resize: "vertical", lineHeight: 1.6 }} />
        </label>
        {/* 사람에게는 보이지 않는 칸(자동 입력 걸러 내기용) */}
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#555", lineHeight: 1.6, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0 }} />
          <span style={{ whiteSpace: "pre-line" }}>{`개인정보 수집·이용에 동의합니다.
· 수집 항목: 담당자명, 회사명, 연락처
· 이용 목적: 문의 회신
· 보관 기간: 회신 완료 후 1년`}</span>
        </label>
        {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
        <button onClick={submit} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", borderRadius: 11, border: "none", background: busy ? "#cbd5c0" : "#5C7A4A", color: "white", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
          <Send size={15} />{busy ? "접수 중…" : "문의 접수"}
        </button>
        <div style={{ fontSize: 11.5, color: "#999", lineHeight: 1.7 }}>양식으로 접수되지 않는 경우 아래 주소로 메일을 보내 주시기 바랍니다.<br />{CONTACT_EMAIL}</div>
      </div>
    </div>
  );
}
