"use client";
// src/components/ContactPrompt.tsx
//
// 로그인한 회원에게 이름·휴대폰 번호(아이디 찾기 전용)가 없으면 한 번 묻는 창입니다.
// 카카오·구글 간편가입, 사장님 가입, 예전에 가입한 회원 모두 해당합니다(이메일 가입은 가입 화면에서 이미 받음).
// "나중에"를 누르면 3일 동안 다시 묻지 않습니다. 저장은 user_contacts 표(본인만 읽고 쓰기)에 합니다.
// 가입·로그인·비밀번호 화면에서는 띄우지 않습니다.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CONTACT_USE_NOTE, formatPhone, isValidName, isValidPhone, normalizeName, normalizePhone } from "@/lib/contact";
import { JOIN_THEMES } from "@/components/brand/JoinLayout";

const t = JOIN_THEMES.oat;
const LATER_KEY = "ggk-contact-later-until";
const SKIP_PATHS = ["/login", "/signup", "/signup-owner", "/reset-password"];

export default function ContactPrompt() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    let cancelled = false;
    (async () => {
      try {
        const until = Number(localStorage.getItem(LATER_KEY) || 0);
        if (until > Date.now()) return;
      } catch {}
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const { data, error: e } = await supabase.from("user_contacts").select("phone, name").eq("auth_user_id", session.user.id).maybeSingle();
      if (cancelled || e) return; // 표가 아직 없거나 오류면 묻지 않음
      if (!data?.phone || !data?.name) {
        setUserId(session.user.id);
        if (data?.name) setName(data.name);
        if (data?.phone) setPhone(formatPhone(data.phone));
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  if (!open || !userId) return null;

  const later = () => {
    try { localStorage.setItem(LATER_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000)); } catch {}
    setOpen(false);
  };
  const save = async () => {
    setError(null);
    if (!isValidName(name)) { setError("이름을 입력해 주세요."); return; }
    if (!isValidPhone(phone)) { setError("휴대폰 번호를 다시 확인해 주세요."); return; }
    setSaving(true);
    const { error: e } = await supabase.from("user_contacts").upsert({ auth_user_id: userId, name: normalizeName(name), phone: normalizePhone(phone), updated_at: new Date().toISOString() });
    setSaving(false);
    if (e) { setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    setOpen(false);
  };

  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${t.field}`, background: "#FFFFFF", fontSize: 15, fontFamily: "inherit", color: "#23201B" };
  return (
    <div className="ggk-body" role="dialog" aria-modal="true" aria-labelledby="contact-prompt-title" style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(42,37,30,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", wordBreak: "keep-all" }}>
      <style>{`.ggk-contact input:focus { outline: none; border-color: ${t.focus} !important; box-shadow: 0 0 0 4px ${t.focusRing}; }`}</style>
      <div className="ggk-contact" style={{ width: "100%", maxWidth: 380, background: "white", borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 64px rgba(42,37,30,0.28)" }}>
        <div style={{ background: t.band, padding: "16px 20px 14px", color: t.ink }}>
          <div id="contact-prompt-title" className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px" }}>계정 찾기 정보를 등록해 주세요</div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 4, lineHeight: 1.6 }}>나중에 가입한 이메일이 기억나지 않을 때<br />이름과 휴대폰 번호로 찾을 수 있어요.</div>
        </div>
        <div style={{ padding: "16px 20px 18px", display: "grid", gap: 9 }}>
          <input id="contact-name" placeholder="이름" aria-label="이름" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} style={input} />
          <input id="contact-phone" placeholder="휴대폰 번호" aria-label="휴대폰 번호" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => { setPhone(formatPhone(e.target.value)); setError(null); }} onKeyDown={(e) => { if (e.key === "Enter") save(); }} style={input} />
          <div style={{ fontSize: 12, color: t.muted }}>{CONTACT_USE_NOTE} 다른 회원에게는 보이지 않아요.</div>
          {error && <div role="alert" style={{ fontSize: 13, color: "#9A3B27", fontWeight: 600 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={later} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${t.softLine}`, background: t.soft, color: t.softInk, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>나중에</button>
            <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: t.btn, color: "white", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.65 : 1 }}>{saving ? "저장하는 중…" : "등록하기"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
