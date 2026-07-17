"use client";

import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

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

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirect = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 로그인
  const handleLogin = async () => {
    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        alert("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        alert("로그인에 실패했습니다. 다시 시도해주세요.");
      }

      return;
    }
    localStorage.setItem("provider", "email");
    window.location.href = redirect;
  };

  // 구글 로그인
  const loginWithGoogle = async () => {
    localStorage.setItem("provider", "google"); // ← 카카오와 동일하게 추가
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
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
        redirectTo: window.location.origin,

        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };
  return (
    <>
      {/* Google 가이드라인 필수: Roboto Medium 폰트 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "420px",
            background: "white",
            borderRadius: "24px",
            padding: "28px",
            boxSizing: "border-box",
            boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          }}
        >
          {/* 닫기 버튼 */}
          <button
            onClick={() => router.back()}
            style={{
              position: "absolute",
              top: "18px",
              right: "18px",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "none",
              background: "#f3f4f6",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            ✕
          </button>

          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              marginBottom: "24px",
            }}
          >
            로그인
          </h1>

          {/* 이메일 */}
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "14px",
              marginBottom: "12px",
              borderRadius: "10px",
              border: "1px solid #ddd",
              boxSizing: "border-box",
            }}
          />

          {/* 비밀번호 */}
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleLogin();
              }
            }}
            style={{
              width: "100%",
              padding: "14px",
              marginBottom: "16px",
              borderRadius: "10px",
              border: "1px solid #ddd",
              boxSizing: "border-box",
            }}
          />

          {/* 로그인 버튼 */}
          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            로그인
          </button>

          {/* 구분선 */}
          <div
            style={{
              margin: "24px 0",
              textAlign: "center",
              color: "#999",
            }}
          >
            또는
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
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
            <button
              onClick={loginWithGoogle}
              aria-label="Google 로그인"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                alignSelf: "stretch",
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

            {/* ──────────────────────────────────────────────────────────
                Kakao 로그인 버튼
                가이드라인: https://developers.kakao.com/docs/ko/kakaologin/design-guide
                - 배경 #FEE500, 심볼·텍스트 rgba(0,0,0,0.85)
                - border-radius 12px, 말풍선 심볼 필수 포함
            ─────────────────────────────────────────────────────────── */}
            <button
              onClick={loginWithKakao}
              aria-label="카카오 로그인"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                alignSelf: "stretch",
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

            {/* 회원가입 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginTop: "18px",
              }}
            >
              {/* 왼쪽 선 */}
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background: "#e5e7eb",
                }}
              />

              {/* 회원가입 버튼 */}
              <button
                onClick={() => router.push(`/signup?redirect=${redirect}`)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                이메일로 회원가입
              </button>

              {/* 오른쪽 선 */}
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background: "#e5e7eb",
                }}
              />
            </div>
          </div>
        </div>
      </div>
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