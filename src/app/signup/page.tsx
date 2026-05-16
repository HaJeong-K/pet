"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirect =
    searchParams.get("redirect") || "/";

  const [id, setId] = useState("");
  const [nickname, setNickname] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [passwordConfirm, setPasswordConfirm] =
    useState("");

  const handleSignup = async () => {
    if (
      !id ||
      !nickname ||
      !password ||
      !passwordConfirm
    ) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const fakeEmail =
      `${id}@gachigagae.com`;

    const { data, error } =
      await supabase.auth.signUp({
        email: fakeEmail,
        password,
        options: {
          data: {
            nickname,
            username: id,
          },
        },
      });

    if (error) {
      alert(error.message);
      return;
    }

    await supabase.from("users").insert([
    {
        auth_user_id: data.user?.id,
        username: id,
        nickname,
    },
    ]);

    alert("회원가입 완료!");

    router.push(
      `/login?redirect=${redirect}`
    );
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
        회원가입
      </h1>

      <input
        placeholder="아이디"
        value={id}
        onChange={(e) => setId(e.target.value)}
        style={inputStyle}
      />

      <input
        placeholder="닉네임"
        value={nickname}
        onChange={(e) =>
          setNickname(e.target.value)
        }
        style={inputStyle}
      />

      <input
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
        style={inputStyle}
      />

      <input
        type="password"
        placeholder="비밀번호 확인"
        value={passwordConfirm}
        onChange={(e) =>
          setPasswordConfirm(e.target.value)
        }
        style={inputStyle}
      />

      <button
        onClick={handleSignup}
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
        회원가입
      </button>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  boxSizing: "border-box" as const,
};