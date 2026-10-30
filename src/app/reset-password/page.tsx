"use client";

// 비밀번호 다시 정하기(/reset-password)
// 로그인 창의 "비밀번호 찾기"에서 보낸 메일의 링크를 누르면 이 화면이 열립니다.
// 링크에 담긴 임시 로그인 정보를 Supabase가 자동으로 읽어(PASSWORD_RECOVERY) 새 비밀번호를 저장할 수 있게 해 줍니다.
// 링크가 만료됐거나 이미 쓴 링크면 다시 메일을 받으라고 안내합니다.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { JOIN_THEMES } from "@/components/brand/JoinLayout";
import { PEEK_SPACE, PeekingDogs } from "@/components/brand/SchnauzerPeek";

const t = JOIN_THEMES.oat;
// 회원가입과 같은 비밀번호 규칙(영문 소문자 1개 이상 + 6자 이상)
const isValidPassword = (pw: string) => /^(?=.*[a-z]).{6,}$/.test(pw);

export default function ResetPasswordPage() {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 링크가 만료·사용됨이면 주소 끝(#)에 오류가 붙어 옵니다
    const expired = /error_description|error_code/.test(window.location.hash);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!expired && (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN"))) setState("ready");
    });
    // 링크를 읽는 데 시간이 걸릴 수 있어 잠시 기다렸다가 확인합니다
    const timer = setTimeout(async () => {
      if (expired) { setState("invalid"); return; }
      const { data: { session } } = await supabase.auth.getSession();
      setState((s) => (s === "checking" ? (session ? "ready" : "invalid") : s));
    }, 1500);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const save = async () => {
    setError(null);
    if (!isValidPassword(pw)) { setError("비밀번호는 영문 소문자를 1개 이상 포함해 6자 이상으로 정해 주세요."); return; }
    if (pw !== pw2) { setError("두 비밀번호가 서로 달라요."); return; }
    setSaving(true);
    const { error: e } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (e) {
      setError(/different from the old|same/i.test(e.message) ? "이전과 다른 비밀번호로 정해 주세요." : "저장하지 못했어요. 메일을 다시 받아 시도해 주세요.");
      return;
    }
    try { localStorage.setItem("provider", "email"); } catch {}
    setState("done");
  };

  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "14px 46px 14px 15px", borderRadius: 12, border: `1px solid ${t.field}`, background: "#FFFFFF", fontSize: 15, fontFamily: "inherit", color: "#23201B" };
  const primary: React.CSSProperties = { width: "100%", padding: 14, borderRadius: 14, border: "none", background: t.btn, color: "white", fontSize: 15.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", textDecoration: "none", display: "block", boxSizing: "border-box" };

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: t.page, wordBreak: "keep-all" }}>
      <style>{`.ggk-reset input:focus { outline: none; border-color: ${t.focus} !important; box-shadow: 0 0 0 4px ${t.focusRing}; }`}</style>
      <div className="ggk-reset" style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: `${PEEK_SPACE + 16}px 20px 24px`, boxSizing: "border-box" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
          <PeekingDogs right={28} />
          <div style={{ position: "relative", zIndex: 1, background: "white", borderRadius: 24, overflow: "hidden", border: `1px solid ${t.cardLine}`, boxShadow: `0 24px 60px ${t.shadow}` }}>
            <div style={{ background: t.band, padding: "20px 24px 18px", color: t.ink }}>
              <Link href="/" aria-label="같이가개 지도"><Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ height: 30, width: "auto", display: "block" }} priority /></Link>
              <h1 className="ggk-logo" style={{ margin: "14px 0 0", fontSize: 23, fontWeight: 800, letterSpacing: "-0.4px" }}>
                {state === "done" ? "비밀번호를 바꿨어요" : "새 비밀번호 정하기"}
              </h1>
              <p style={{ margin: "5px 0 0", fontSize: 13.5, color: t.muted, lineHeight: 1.6 }}>
                {state === "done" ? "새 비밀번호로 로그인된 상태예요." : "앞으로 로그인할 때 쓸 비밀번호를 입력해 주세요."}
              </p>
            </div>

            <div style={{ padding: "20px 24px 24px" }}>
              {state === "checking" && <div style={{ textAlign: "center", color: t.muted, fontSize: 14, padding: "18px 0" }}>링크를 확인하고 있어요…</div>}

              {state === "invalid" && (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ padding: "13px 14px", borderRadius: 12, background: "#FDF3F1", border: "1px solid #F4D6CF", color: "#8a3b2c", fontSize: 13.5, lineHeight: 1.65 }}>
                    링크가 만료됐거나 이미 사용한 링크예요.<br />로그인 창의 &lsquo;비밀번호 찾기&rsquo;에서 메일을 다시 받아 주세요.
                  </div>
                  <Link href="/login" style={primary}>로그인 창으로 가기</Link>
                </div>
              )}

              {state === "ready" && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <input id="new-password" type={show ? "text" : "password"} placeholder="새 비밀번호" aria-label="새 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} style={input} />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: t.muted, cursor: "pointer", padding: 4, display: "flex" }}>
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <input id="new-password-confirm" type={show ? "text" : "password"} placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} style={input} />
                  <div style={{ fontSize: 12, color: t.muted }}>영문 소문자를 1개 이상 포함한 6자 이상</div>
                  {error && <div role="alert" style={{ fontSize: 13, color: "#B4412B", fontWeight: 600 }}>{error}</div>}
                  <button type="button" onClick={save} disabled={saving} style={{ ...primary, marginTop: 4, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "저장하는 중…" : "새 비밀번호 저장"}
                  </button>
                </div>
              )}

              {state === "done" && <Link href="/" style={primary}>같이가개 지도로 가기</Link>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
