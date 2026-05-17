"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

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

  // ✅ 비밀번호 표시/숨김 상태
  const [showPassword, setShowPassword] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  // ✅ 아이디 유효성 검사
  // 영문 소문자 + 숫자만 허용
  const isValidUsername = (
    username: string
  ) => {
    return /^[a-z0-9]+$/.test(username);
  };

  const handleSignup = async () => {

    // ✅ 빈 값 검사
    if (
      !id ||
      !nickname ||
      !password ||
      !passwordConfirm
    ) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    // ✅ 아이디 형식 검사
    if (!isValidUsername(id)) {
      alert(
        "아이디는 영문 소문자와 숫자만 사용할 수 있습니다."
      );
      return;
    }

    // ✅ 비밀번호 일치 검사
    if (password !== passwordConfirm) {
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

      {/* 아이디 */}
      <input
        placeholder="아이디"
        value={id}
        onChange={(e) =>
          setId(e.target.value)
        }
        style={inputStyle}
      />

      {/* 아이디 안내문 */}
      <p
        style={{
          fontSize: "12px",
          color: "#777",
          marginTop: "-6px",
          marginBottom: "14px",
        }}
      >
        영문 소문자와 숫자만 사용할 수 있습니다.
      </p>

      {/* 닉네임 */}
      <input
        placeholder="닉네임"
        value={nickname}
        onChange={(e) =>
          setNickname(e.target.value)
        }
        style={inputStyle}
      />

      {/* 비밀번호 */}
      <div
        style={{
          position: "relative",
          marginBottom: "12px",
        }}
      >
        <input
          type={
            showPassword
              ? "text"
              : "password"
          }
          placeholder="비밀번호"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={{
            ...inputStyle,
            marginBottom: 0,
            paddingRight: "46px",
          }}
        />

        <button
          type="button"
          onClick={() =>
            setShowPassword(
              !showPassword
            )
          }
          style={{
            position: "absolute",
            right: "14px",
            top: "50%",
            transform:
              "translateY(-50%)",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#777",
          }}
        >
          {showPassword ? (
            <EyeOff size={20} />
          ) : (
            <Eye size={20} />
          )}
        </button>
      </div>

      {/* 비밀번호 확인 */}
      <div
        style={{
          position: "relative",
          marginBottom: "6px",
        }}
      >
        <input
          type={
            showConfirmPassword
              ? "text"
              : "password"
          }
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) =>
            setPasswordConfirm(
              e.target.value
            )
          }
          style={{
            ...inputStyle,
            marginBottom: 0,
            paddingRight: "46px",
          }}
        />

        <button
          type="button"
          onClick={() =>
            setShowConfirmPassword(
              !showConfirmPassword
            )
          }
          style={{
            position: "absolute",
            right: "14px",
            top: "50%",
            transform:
              "translateY(-50%)",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#777",
          }}
        >
          {showConfirmPassword ? (
            <EyeOff size={20} />
          ) : (
            <Eye size={20} />
          )}
        </button>
      </div>

      {/* ✅ 비밀번호 불일치 문구 */}
      {passwordConfirm &&
        password !==
          passwordConfirm && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "13px",
              marginTop: "4px",
              marginBottom: "14px",
              fontWeight: 500,
            }}
          >
            비밀번호가 일치하지
            않습니다.
          </p>
        )}

      {/* 회원가입 버튼 */}
      <button
        onClick={handleSignup}
        disabled={
          password !==
          passwordConfirm
        }
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "10px",
          border: "none",

          background:
            password !==
            passwordConfirm
              ? "#ccc"
              : "#111",

          color: "white",
          fontWeight: 700,

          cursor:
            password !==
            passwordConfirm
              ? "default"
              : "pointer",

          transition:
            "all 0.15s ease",
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
  fontSize: "14px",
};