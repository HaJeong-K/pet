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