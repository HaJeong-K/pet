"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 로그인 후 돌아갈 주소
  const redirect =
    searchParams.get("redirect") || "/";

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");

  // 로그인
  const handleLogin = async () => {
    if (!id || !password) {
      alert("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    // 이메일 형태로 변환
    const fakeEmail = `${id}@gachigagae.com`;

    const { error } =
      await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });

    if (error) {
      alert("로그인 실패");
      return;
    }

    // 로그인 성공 시 원래 페이지로 복귀
    router.back();
  };

  // 구글 로그인
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          window.location.origin + redirect,
      },
    });
  };

  // 카카오 로그인
  const loginWithKakao = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo:
          window.location.origin + redirect,
      },
    });
  };

  return (
    <div
      style={{
        maxWidth: "420px",
        margin: "80px auto",
        padding: "24px",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 800,
          marginBottom: "24px",
        }}
      >
        로그인
      </h1>

      {/* 아이디 */}
      <input
        placeholder="아이디"
        value={id}
        onChange={(e) => setId(e.target.value)}
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

      {/* 구글 로그인 */}
      <button
        onClick={loginWithGoogle}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "10px",
          border: "1px solid #ddd",
          background: "white",
          marginBottom: "10px",
          cursor: "pointer",
        }}
      >
        구글로 로그인
      </button>

      {/* 카카오 로그인 */}
      <button
        onClick={loginWithKakao}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "10px",
          border: "none",
          background: "#FEE500",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        카카오로 로그인
      </button>

      {/* 회원가입 */}
      <button
        onClick={() =>
          router.back()
        }
        style={{
          marginTop: "18px",
          width: "100%",
          background: "transparent",
          border: "none",
          color: "#666",
          cursor: "pointer",
        }}
      >
        회원가입 하러가기
      </button>
    </div>
  );
}