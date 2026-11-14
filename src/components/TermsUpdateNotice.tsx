"use client";

// 약관·운영정책이 바뀌었을 때 기존 회원에게 한 번 알리고 확인 시점을 남깁니다 — 2026-11-13
//   · 지금 버전(TERMS_VERSION)과 회원 정보(user_metadata.terms_version)가 다르면 로그인한 회원에게 안내 창을 띄웁니다.
//   · [확인했어요]를 누르면 회원 정보에 버전과 확인한 때(terms_confirmed_at)를 남깁니다. 닫기만 하면 7일 뒤 다시 묻습니다.
//   · 새로 가입한 회원은 가입할 때 이미 최신 약관에 동의하므로, 가입 후 7일 동안은 묻지 않습니다.
// 약관을 바꿀 때는 TERMS_VERSION과 TERMS_CHANGES만 고치면 됩니다.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const TERMS_VERSION = "2026-11-13";
const TERMS_CHANGES = [
  "이용약관 제8조의3(이용 제한) 신설 — 약관·운영정책 위반 시 경고, 기간 작성 제한, 영구 정지",
  "커뮤니티 운영정책 4. 신고 및 제재 — 제재 단계(1회 경고 → 2회 7일 → 3회 30일 → 4회 이상 영구 정지)와 이의 제기 절차",
];
const SNOOZE_KEY = "ggk-terms-snooze";
const WEEK_MS = 7 * 86_400_000;

export default function TermsUpdateNotice() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (cancelled || !user) return;
      if (user.user_metadata?.terms_version === TERMS_VERSION) return;
      if (Date.now() - new Date(user.created_at).getTime() < WEEK_MS) return;
      try { if (Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < WEEK_MS) return; } catch { /* 무시 */ }
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!open) return null;
  const later = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* 무시 */ } setOpen(false); };
  const confirm = async () => {
    setBusy(true);
    await supabase.auth.updateUser({ data: { terms_version: TERMS_VERSION, terms_confirmed_at: new Date().toISOString() } }).catch(() => null);
    setBusy(false);
    setOpen(false);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="약관 변경 안내" style={{ position: "fixed", inset: 0, zIndex: 10150, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(400px, 100%)", background: "white", borderRadius: 18, padding: "22px 20px 16px", boxShadow: "0 18px 44px rgba(42,28,20,0.25)" }}>
        <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#3B2A20" }}>이용약관이 바뀌었어요</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#5E5048", lineHeight: 1.6 }}>{TERMS_VERSION.replace(/-/g, ".")}부터 아래 내용이 적용돼요.</div>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13.5, color: "#1F1A16", lineHeight: 1.7 }}>
          {TERMS_CHANGES.map((line) => <li key={line} style={{ marginBottom: 6 }}>{line}</li>)}
        </ul>
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#5E5048", lineHeight: 1.6 }}>전체 내용은 화면 아래 &lsquo;이용약관&rsquo;과 &lsquo;커뮤니티 운영정책&rsquo;에서 볼 수 있어요.<br />동의하지 않으면 마이페이지에서 탈퇴할 수 있어요.</div>
        <button onClick={confirm} disabled={busy} style={{ marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#3B2A20", color: "white", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>확인했어요</button>
        <button onClick={later} style={{ marginTop: 6, width: "100%", padding: "9px 0", border: "none", background: "transparent", color: "#5c5c5c", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>나중에 볼게요</button>
      </div>
    </div>
  );
}
