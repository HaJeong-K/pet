"use client";

// 로그인 창(팝업) — /login을 직접 열어도 같은 화면(src/app/login/page.tsx)
// 화면 세 가지를 한 카드 안에서 바꿔 보여 줍니다.
//   · 로그인 : 이메일·비밀번호(비밀번호 보기), 로그인 상태 유지(끄면 브라우저를 닫을 때 로그아웃 — SessionKeepGuard),
//             최근에 쓴 로그인 방법 표시, 간편 로그인(구글·카카오), 가입 버튼
//   · 아이디 찾기 : 닉네임으로 가입 이메일을 일부 가려서 보여 줌(/api/auth/find-id)
//   · 비밀번호 찾기 : 가입 이메일로 비밀번호 다시 정하기 메일 보내기 → /reset-password
// 색은 회원가입 화면(오트밀 + 머스터드, components/brand/JoinLayout.tsx의 oat)과 같은 계열입니다.

import { useState, useSyncExternalStore, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { TermsModal, PrivacyModal } from "@/components/SiteFooter";
import { closeModal } from "@/lib/closeModal";
import { ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";
import { JOIN_THEMES } from "@/components/brand/JoinLayout";
import { PEEK_SPACE_COMPACT, PeekingDogs } from "@/components/brand/SchnauzerPeek";
import { rememberLoginChoice } from "@/components/SessionKeepGuard";
import { formatPhone, isValidName, isValidPhone } from "@/lib/contact";

// ─── Google G 로고 SVG (공식 색상 고정, 변경 불가) ────────────────────────
const GoogleGLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04
         2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23
         1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18
         C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97
         1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// ─── Kakao 말풍선 심볼 SVG (형태·비율·색상 변경 불가) ─────────────────────
const KakaoSymbol = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <ellipse cx="12" cy="10.5" rx="11" ry="8.5" fill="#000000" />
    <path
      d="M8.5 17.5 C9 19.5 10 21 12 22 C14 21 15 19.5 15.5 17.5 Z"
      fill="#000000"
    />
  </svg>
);

const t = JOIN_THEMES.oat;
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const PROVIDER_LABEL: Record<string, string> = { email: "이메일로 가입", kakao: "카카오로 가입", google: "구글로 가입" };

type View = "login" | "findId" | "findPw";
const subscribeNothing = () => () => {};
const readLastProvider = () => { try { return localStorage.getItem("provider"); } catch { return null; } };
type FoundAccount = { email: string; provider: string; joined: string | null };

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirect = searchParams.get("redirect") || "/";

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLogin, setKeepLogin] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  // 이 기기에서 마지막으로 쓴 로그인 방법(email·google·kakao) — 버튼 옆에 "최근" 표시
  const lastProvider = useSyncExternalStore(subscribeNothing, readLastProvider, () => null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // 아이디 찾기
  const [findName, setFindName] = useState("");
  const [findPhone, setFindPhone] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<FoundAccount[] | null>(null);
  const [findError, setFindError] = useState<string | null>(null);

  // 비밀번호 찾기
  const [resetEmail, setResetEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const goView = (next: View) => {
    setView(next);
    setLoginError(null); setFindError(null); setFound(null); setResetMsg(null);
    if (next === "findPw" && !resetEmail && isValidEmail(email)) setResetEmail(email);
  };

  // 로그인
  const handleLogin = async () => {
    setLoginError(null);
    if (!email || !password) {
      setLoginError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoggingIn(false);
      if (error.message.includes("Invalid login credentials")) {
        setLoginError("이메일 또는 비밀번호가 맞지 않아요.");
      } else if (error.message.toLowerCase().includes("email not confirmed")) {
        setLoginError("메일 인증을 아직 마치지 않았어요. 받은 메일함을 확인해 주세요.");
      } else {
        setLoginError("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      return;
    }
    localStorage.setItem("provider", "email");
    rememberLoginChoice(keepLogin);
    window.location.href = redirect;
  };

  // 구글 로그인
  const loginWithGoogle = async () => {
    localStorage.setItem("provider", "google"); // ← 카카오와 동일하게 추가
    rememberLoginChoice(true); // 간편 로그인은 항상 유지
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // 끝에 "/"를 붙여야 Supabase 허용 목록 패턴(예: http://host:3000/**)과 맞습니다 — 안 맞으면
        // Supabase가 기본 주소(Site URL, localhost)로 돌려보내 휴대폰에서 "연결 거부"가 났습니다.
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          prompt: "select_account", // ← 매번 계정 선택창 표시
        },
      },
    });
  };

  // 카카오 로그인
  const loginWithKakao = async () => {
    // 기존 세션 완전 제거
    await supabase.auth.signOut({
      scope: "global",
    });

    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem("provider", "kakao");

    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        // 끝에 "/"를 붙여야 Supabase 허용 목록 패턴(예: http://host:3000/**)과 맞습니다 — 안 맞으면
        // Supabase가 기본 주소(Site URL, localhost)로 돌려보내 휴대폰에서 "연결 거부"가 났습니다.
        redirectTo: `${window.location.origin}/`,

        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };

  // 아이디(이메일) 찾기 — 이름 + 휴대폰 번호로
  const findId = async () => {
    setFindError(null); setFound(null);
    if (!isValidName(findName)) { setFindError("이름을 입력해 주세요."); return; }
    if (!isValidPhone(findPhone)) { setFindError("휴대폰 번호를 다시 확인해 주세요."); return; }
    setFinding(true);
    try {
      const res = await fetch("/api/auth/find-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: findName, phone: findPhone }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) setFindError(json?.error || "지금은 찾을 수 없어요. 잠시 후 다시 시도해 주세요.");
      else setFound(json?.accounts ?? []);
    } catch {
      setFindError("지금은 찾을 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
    setFinding(false);
  };

  // 비밀번호 찾기 — 다시 정하기 메일 보내기
  const sendReset = async () => {
    setResetMsg(null);
    const target = resetEmail.trim();
    if (!isValidEmail(target)) { setResetMsg({ ok: false, text: "이메일 주소를 다시 확인해 주세요." }); return; }
    setSending(true);
    const { data: kind } = await supabase.rpc("check_email_exists", { p_email: target });
    if (kind === "none") {
      setSending(false);
      setResetMsg({ ok: false, text: "이 이메일로 가입된 계정이 없어요. 아이디 찾기를 이용해 보세요." });
      return;
    }
    if (kind === "kakao") {
      setSending(false);
      setResetMsg({ ok: false, text: "카카오로 가입한 계정이에요. 아래 카카오 로그인으로 들어와 주세요." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo: `${window.location.origin}/reset-password` });
    setSending(false);
    if (error) {
      setResetMsg({ ok: false, text: /rate|seconds|limit/i.test(error.message) ? "메일을 너무 자주 보냈어요. 1분 뒤에 다시 시도해 주세요." : "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." });
      return;
    }
    setResetMsg({ ok: true, text: "비밀번호를 다시 정하는 메일을 보냈어요. 메일함(스팸함 포함)에서 링크를 눌러 주세요." });
  };

  const softBtn: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: "11px 10px", borderRadius: 12, border: `1px solid ${t.softLine}`, background: t.soft,
    color: t.softInk, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  const primaryBtn: React.CSSProperties = {
    width: "100%", padding: "13px", borderRadius: 14, border: "none", background: t.btn, color: "white",
    fontSize: 15.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 10px 22px rgba(0,0,0,0.14)",
  };
  const linkBtn: React.CSSProperties = { border: "none", background: "transparent", padding: "2px 0", color: t.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const recentTag = (
    <span style={{ position: "absolute", top: -9, right: 12, padding: "2px 8px", borderRadius: 999, background: t.btn, color: "white", fontSize: 10.5, fontWeight: 800, letterSpacing: "-0.1px", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>최근 로그인</span>
  );

  const heading = view === "login"
    ? { title: "다시 만나서 반가워요", sub: "로그인하고 찜·후기·숙소 예약을 이어서 해 보세요." }
    : view === "findId"
      ? { title: "아이디(이메일) 찾기", sub: "등록한 이름과 휴대폰 번호로 가입 이메일을 찾아 드려요." }
      : { title: "비밀번호 찾기", sub: "가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드려요." };

  return (
    <>
      {/* Google 가이드라인 필수: Roboto Medium 폰트 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .ggk-login input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; border: 1px solid ${t.field}; background: #FFFFFF; font-size: 15px; font-family: inherit; color: #23201B; transition: border-color .15s ease, box-shadow .15s ease; }
        .ggk-login input:not([type="checkbox"]):focus { outline: none; border-color: ${t.focus}; box-shadow: 0 0 0 4px ${t.focusRing}; }
        .ggk-login-close:hover { background: ${t.band} !important; }
        .ggk-login-link:hover { color: ${t.ink} !important; }
      `}</style>

      <div
        className="ggk-body ggk-login"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,37,30,0.42)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 99999,
          overflowY: "auto",
          boxSizing: "border-box",
          wordBreak: "keep-all",
        }}
      >
        <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: `${PEEK_SPACE_COMPACT + 10}px 16px 16px`, boxSizing: "border-box" }}>
        {/* 카드 — 슈나우저 두 마리가 카드 위로 내다봅니다(가입 화면과 같은 모습) */}
        <div style={{ position: "relative", width: "100%", maxWidth: 400 }}>
          <PeekingDogs right={24} compact />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              background: "white",
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(42,37,30,0.28)",
            }}
          >
            {/* 머리 띠 — 로고와 인사 */}
            <div style={{ background: t.band, padding: "16px 22px 14px", color: t.ink, position: "relative" }}>
              <button
                className="ggk-login-close"
                onClick={() => closeModal(router)}
                aria-label="닫기"
                style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: 999, border: `1px solid ${t.chipLine}`, background: "#FFFFFF", color: t.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={17} />
              </button>
              {view !== "login" && (
                <button type="button" onClick={() => goView("login")} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "transparent", padding: "2px 0", marginBottom: 8, color: t.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <ArrowLeft size={15} />로그인으로
                </button>
              )}
              <h1 className="ggk-logo" style={{ margin: 0, paddingRight: 40, fontSize: 21, fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1.35 }}>
                {heading.title}
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: t.muted, lineHeight: 1.55 }}>
                {heading.sub}
              </p>
            </div>

            <div style={{ padding: "16px 22px 18px" }}>
              {view === "login" && (
                <>
                  {/* 이메일 · 비밀번호 */}
                  <div style={{ position: "relative", display: "grid", gap: 8 }}>
                    {lastProvider === "email" && recentTag}
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="이메일"
                      aria-label="이메일"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                    />
                    <div style={{ position: "relative" }}>
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="비밀번호"
                        aria-label="비밀번호"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleLogin();
                          }
                        }}
                        style={{ paddingRight: 46 }}
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: t.muted, cursor: "pointer", padding: 4, display: "flex" }}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* 로그인 상태 유지 · 아이디/비밀번호 찾기 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: t.ink, userSelect: "none" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${keepLogin ? t.btn : "#CFC8BA"}`, background: keepLogin ? t.btn : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {keepLogin && <Check size={13} color="white" strokeWidth={3} />}
                      </span>
                      <input id="login-keep" type="checkbox" checked={keepLogin} onChange={(e) => setKeepLogin(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
                      로그인 상태 유지
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button type="button" className="ggk-login-link" onClick={() => goView("findId")} style={linkBtn}>아이디 찾기</button>
                      <span aria-hidden style={{ width: 1, height: 11, background: "#D8D1C2" }} />
                      <button type="button" className="ggk-login-link" onClick={() => goView("findPw")} style={linkBtn}>비밀번호 찾기</button>
                    </div>
                  </div>
                  {!keepLogin && <div style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>브라우저를 닫으면 자동으로 로그아웃돼요. 공용 기기에서 쓰기 좋아요.</div>}

                  {loginError && <div role="alert" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FDF3F1", border: "1px solid #F4D6CF", color: "#9A3B27", fontSize: 13, fontWeight: 600 }}>{loginError}</div>}

                  {/* 로그인 버튼 */}
                  <button onClick={handleLogin} disabled={loggingIn} style={{ ...primaryBtn, marginTop: 12, opacity: loggingIn ? 0.65 : 1 }}>
                    {loggingIn ? "로그인하는 중…" : "로그인"}
                  </button>

                  {/* 구분선 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px", color: "#A39B8B", fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ flex: 1, height: 1, background: t.cardLine }} />
                    간편 로그인
                    <span style={{ flex: 1, height: 1, background: t.cardLine }} />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      width: "100%",
                      alignItems: "stretch",
                    }}
                  >
                    {/* ──────────────────────────────────────────────────────────
                        Google 로그인 버튼
                        가이드라인: https://developers.google.com/identity/branding-guidelines
                        - 배경 #FFFFFF, 테두리 #747775 1px
                        - 글자색 #1F1F1F, Roboto Medium 14px
                        - 패딩: 로고 앞 12px / 로고 뒤 10px / 텍스트 뒤 12px
                    ─────────────────────────────────────────────────────────── */}
                    <div style={{ position: "relative" }}>
                      {lastProvider === "google" && recentTag}
                      <button
                        onClick={loginWithGoogle}
                        aria-label="Google 로그인"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          height: "44px",
                          backgroundColor: "#F2F2F2",
                          border: "none",
                          borderRadius: "12px",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily:"-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
                          fontWeight: 600,
                          fontSize: "15px",
                          lineHeight: "20px",
                          color: "#1F1F1F",
                          letterSpacing: "0.25px",
                          boxSizing: "border-box",
                          whiteSpace: "nowrap",
                          userSelect: "none",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#F8FAFE";
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#F2F2F2";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <span style={{ paddingLeft: "12px", display: "flex", alignItems: "center" }}>
                          <GoogleGLogo />
                        </span>
                        <span style={{ paddingLeft: "10px", paddingRight: "12px" }}>
                          Google 로그인
                        </span>
                      </button>
                    </div>

                    {/* ──────────────────────────────────────────────────────────
                        Kakao 로그인 버튼
                        가이드라인: https://developers.kakao.com/docs/ko/kakaologin/design-guide
                        - 배경 #FEE500, 심볼·텍스트 rgba(0,0,0,0.85)
                        - border-radius 12px, 말풍선 심볼 필수 포함
                    ─────────────────────────────────────────────────────────── */}
                    <div style={{ position: "relative" }}>
                      {lastProvider === "kakao" && recentTag}
                      <button
                        onClick={loginWithKakao}
                        aria-label="카카오 로그인"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          height: "44px",
                          backgroundColor: "#FEE500",
                          border: "none",
                          borderRadius: "12px",
                          cursor: "pointer",
                          padding: "0 16px",
                          gap: "8px",
                          fontFamily:"-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
                          fontWeight: 600,
                          fontSize: "15px",
                          color: "rgba(0, 0, 0, 0.85)",
                          boxSizing: "border-box",
                          whiteSpace: "nowrap",
                          userSelect: "none",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#F5DC00";
                          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#FEE500";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <KakaoSymbol />
                        <span>카카오 로그인</span>
                      </button>
                    </div>

                    {/* ⚠ 소셜 로그인은 이메일 가입처럼 체크박스로 동의를 받는 별도 화면이 없어서,
                        버튼 바로 아래에 "계속 진행 시 동의로 간주" 안내와 약관 링크를 둡니다 —
                        소셜 로그인을 쓰는 서비스들의 일반적인 처리 방식입니다. */}
                    <p style={{ fontSize: 11.5, color: "#A39B8B", textAlign: "center", lineHeight: 1.6, margin: "2px 0 0" }}>
                      계속 진행 시{" "}
                      <button type="button" onClick={() => setShowTermsModal(true)} style={{ border: "none", background: "transparent", color: t.muted, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 11.5, fontFamily: "inherit" }}>이용약관</button>
                      {" "}및{" "}
                      <button type="button" onClick={() => setShowPrivacyModal(true)} style={{ border: "none", background: "transparent", color: t.muted, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 11.5, fontFamily: "inherit" }}>개인정보 처리방침</button>
                      에 동의하는 것으로 간주됩니다.
                    </p>
                  </div>

                  {/* 가입 — 일반 회원 / 사장님. 팝업이 아닌 가입 화면이라 페이지를 새로 엽니다(그냥 넘기면 로그인 팝업이 그대로 남았음).
                      replace라 가입 화면의 닫기(뒤로)는 로그인 팝업이 아니라 그 전 화면으로 돌아갑니다. */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.cardLine}` }}>
                    <div style={{ fontSize: 12.5, color: t.muted, textAlign: "center", marginBottom: 8 }}>아직 계정이 없으신가요?</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => window.location.replace(`/signup?redirect=${encodeURIComponent(redirect)}`)}
                        style={softBtn}
                      >
                        이메일로 회원가입
                      </button>
                      <button
                        onClick={() => window.location.replace(`/signup-owner?redirect=${encodeURIComponent(redirect)}`)}
                        style={softBtn}
                      >
                        사장님으로 가입
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* 아이디(이메일) 찾기 */}
              {view === "findId" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      id="find-name"
                      placeholder="이름"
                      aria-label="이름"
                      autoComplete="name"
                      value={findName}
                      onChange={(e) => { setFindName(e.target.value); setFindError(null); }}
                    />
                    <input
                      id="find-phone"
                      placeholder="휴대폰 번호"
                      aria-label="휴대폰 번호"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={findPhone}
                      onChange={(e) => { setFindPhone(formatPhone(e.target.value)); setFindError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") findId(); }}
                    />
                  </div>
                  <button type="button" onClick={findId} disabled={finding} style={{ ...primaryBtn, opacity: finding ? 0.65 : 1 }}>
                    {finding ? "찾는 중…" : "아이디 찾기"}
                  </button>
                  {findError && <div role="alert" style={{ fontSize: 13, color: "#9A3B27", fontWeight: 600 }}>{findError}</div>}
                  {found && found.length === 0 && (
                    <div style={{ padding: "12px 14px", borderRadius: 12, background: t.soft, border: `1px solid ${t.softLine}`, fontSize: 13.5, color: t.softInk, lineHeight: 1.65 }}>
                      이 이름과 번호로 등록된 계정을 찾지 못했어요.<br />간편가입(카카오·구글)이라면 해당 버튼으로 바로 로그인해 보세요.
                    </div>
                  )}
                  {found && found.length > 0 && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {found.map((a, i) => (
                        <div key={i} style={{ padding: "13px 14px", borderRadius: 12, background: t.soft, border: `1px solid ${t.softLine}` }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, letterSpacing: "0.2px" }}>{a.email}</div>
                          <div style={{ fontSize: 12.5, color: t.muted, marginTop: 3 }}>
                            {PROVIDER_LABEL[a.provider] ?? "이메일로 가입"}{a.joined ? ` · ${a.joined} 가입` : ""}
                          </div>
                          {a.provider !== "email" && (
                            <div style={{ fontSize: 12.5, color: t.softInk, marginTop: 6, fontWeight: 600 }}>
                              {a.provider === "kakao" ? "카카오 로그인 버튼으로 들어와 주세요." : "Google 로그인 버튼으로 들어와 주세요."}
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.6 }}>개인정보 보호를 위해 이메일 일부를 가려서 보여 드려요.</div>
                      <button type="button" onClick={() => goView("login")} style={softBtn}>로그인하러 가기</button>
                    </div>
                  )}
                  <button type="button" className="ggk-login-link" onClick={() => goView("findPw")} style={{ ...linkBtn, justifySelf: "center" }}>비밀번호가 기억나지 않나요?</button>
                </div>
              )}

              {/* 비밀번호 찾기 */}
              {view === "findPw" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder="가입한 이메일"
                    aria-label="가입한 이메일"
                    value={resetEmail}
                    onChange={(e) => { setResetEmail(e.target.value); setResetMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") sendReset(); }}
                  />
                  <button type="button" onClick={sendReset} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.65 : 1 }}>
                    {sending ? "보내는 중…" : "재설정 메일 보내기"}
                  </button>
                  {resetMsg && (
                    <div role={resetMsg.ok ? "status" : "alert"} style={{ padding: "11px 13px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.65, fontWeight: 600, ...(resetMsg.ok ? { background: "#F1F6EB", border: "1px solid #CFDDBF", color: "#3F5636" } : { background: "#FDF3F1", border: "1px solid #F4D6CF", color: "#9A3B27" }) }}>
                      {resetMsg.text}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.6 }}>카카오·구글로 가입했다면 비밀번호 없이 해당 버튼으로 로그인하면 돼요.</div>
                  <button type="button" className="ggk-login-link" onClick={() => goView("findId")} style={{ ...linkBtn, justifySelf: "center" }}>가입한 이메일이 기억나지 않나요?</button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
