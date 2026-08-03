"use client";

import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [isNicknameTaken, setIsNicknameTaken] = useState(false);

  const [emailChecked, setEmailChecked] = useState(false);
  const [emailProvider, setEmailProvider] = useState<"none" | "email" | "kakao">("none");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isValidPassword = (password: string) =>
    /^(?=.*[a-z]).{6,}$/.test(password);

  const checkEmailDuplicate = async () => {
    if (!email || !isValidEmail(email)) return;

    setIsCheckingEmail(true);

    const { data, error } = await supabase.rpc("check_email_exists", {
      p_email: email,
    });

    setIsCheckingEmail(false);

    if (error) {
      console.error("이메일 중복검사 오류:", error);
      return;
    }

    setEmailProvider(data as "none" | "email" | "kakao");
    setEmailChecked(true);
  };

  const checkNicknameDuplicate = async (nickname: string) => {
    if (!nickname.trim()) {
      setIsNicknameTaken(false);
      return;
    }

    const { data, error } = await supabase.rpc("check_nickname_exists", {
      p_nickname: nickname,
    });

    if (error) {
      console.error("닉네임 중복검사 오류:", error);
      setIsNicknameTaken(false);
      return;
    }

    setIsNicknameTaken(data === true);
  };

  const handleSignup = async () => {
    if (!email || !nickname || !password || !passwordConfirm) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    if (!isValidEmail(email)) return;

    if (!emailChecked) {
      alert("이메일 중복 확인을 해주세요.");
      return;
    }

    if (emailProvider !== "none") return;

    // 회원가입 직전 닉네임 중복 재확인
    const { data: nicknameData, error: nicknameError } = await supabase.rpc(
      "check_nickname_exists",
      { p_nickname: nickname }
    );

    if (nicknameError) {
      alert("닉네임 확인 중 오류가 발생했습니다.");
      return;
    }

    if (nicknameData === true) {
      setIsNicknameTaken(true);
      alert("이미 사용중인 닉네임입니다.");
      return;
    }

    if (!isValidPassword(password)) return;
    if (password !== passwordConfirm) return;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: nickname,    // ← 이게 있어야 대시보드 Display name에 표시됨
          nickname,               // ← KakaoMap.tsx, page.tsx의 user_metadata 읽기용으로 유지
        },
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    if (!data.user) {
      alert("회원가입에 실패했습니다.");
      return;
    }

    const { error: insertError } = await supabase.from("users").insert([
      {
        auth_user_id: data.user.id,
        email,
        nickname,
      },
    ]);

    if (insertError) {
      console.error("users 테이블 insert 실패:", insertError);
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (loginError) {
      alert("회원가입은 완료되었지만 자동 로그인에 실패했습니다.");
      router.push(`/login?redirect=${redirect}`);
      return;
    }

    alert("회원가입이 완료되었습니다.\n확인을 누르시면 자동으로 로그인됩니다.");
    window.location.href = redirect;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailChecked(false);
    setEmailProvider("none");
  };

  const isSubmitDisabled =
    !email ||
    !emailChecked ||
    emailProvider !== "none" ||
    !nickname ||
    isNicknameTaken ||
    !password ||
    !passwordConfirm ||
    !isValidEmail(email) ||
    !isValidPassword(password) ||
    password !== passwordConfirm;

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

        {/* 제목 */}
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px" }}>
          이메일로 회원가입
        </h1>

        {/* 이메일 입력 + 중복 확인 버튼 */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
          <input
            placeholder="이메일"
            value={email}
            onChange={handleEmailChange}
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <button
            type="button"
            onClick={checkEmailDuplicate}
            disabled={!email || !isValidEmail(email) || isCheckingEmail}
            style={{
              padding: "0 14px",
              borderRadius: "10px",
              border: "none",
              background:
                !email || !isValidEmail(email) || isCheckingEmail
                  ? "#ccc"
                  : "#111",
              color: "white",
              fontWeight: 700,
              fontSize: "13px",
              cursor:
                !email || !isValidEmail(email) || isCheckingEmail
                  ? "default"
                  : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {isCheckingEmail ? "확인 중..." : "중복 확인"}
          </button>
        </div>

        {/* 이메일 형식 에러 */}
        {email && !isValidEmail(email) && (
          <p style={errorTextStyle}>이메일을 다시 확인해주세요.</p>
        )}

        {/* 이메일 중복 체크 결과 */}
        {emailChecked && (
          <p style={emailProvider !== "none" ? errorTextStyle : successTextStyle}>
            {emailProvider === "email" && "이미 사용중인 이메일입니다."}
            {emailProvider === "kakao" && "카카오 계정으로 가입된 이메일입니다."}
            {emailProvider === "none" && "사용 가능한 이메일입니다."}
          </p>
        )}

        {/* 이메일 안내문 */}
        <p style={{ ...guideTextStyle, marginTop: "6px" }}>
          사용중인 이메일로 가입 가능합니다.
        </p>

        {/* 닉네임 */}
        <input
          placeholder="닉네임"
          value={nickname}
          onChange={async (e) => {
            const value = e.target.value;
            setNickname(value);
            await checkNicknameDuplicate(value);
          }}
          style={inputStyle}
        />

        {/* 닉네임 중복 에러 */}
        {nickname && isNicknameTaken && (
          <p style={errorTextStyle}>이미 사용중인 닉네임입니다.</p>
        )}

        {/* 비밀번호 */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, marginBottom: 0, paddingRight: "48px" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={eyeButtonStyle}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {/* 비밀번호 규칙 오류 */}
        {password && !isValidPassword(password) && (
          <p style={errorTextStyle}>
            비밀번호는 영문 소문자를 1개 이상 포함한 6자 이상이어야 합니다.
          </p>
        )}

        <p style={guideTextStyle}>
          영문 소문자를 1개 이상 포함한 6자 이상의 비밀번호만 사용가능
        </p>

        {/* 비밀번호 확인 */}
        <div style={{ position: "relative", marginBottom: "4px" }}>
          <input
            type={showConfirmPassword ? "text" : "password"}
            placeholder="비밀번호 확인"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ ...inputStyle, marginBottom: 0, paddingRight: "48px" }}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            style={eyeButtonStyle}
          >
            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {/* 비밀번호 불일치 */}
        {passwordConfirm && password !== passwordConfirm && (
          <p style={errorTextStyle}>비밀번호가 일치하지 않습니다.</p>
        )}

        {/* 회원가입 버튼 */}
        <button
          onClick={handleSignup}
          disabled={isSubmitDisabled}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "none",
            background: isSubmitDisabled ? "#ccc" : "#111",
            color: "white",
            fontWeight: 700,
            cursor: isSubmitDisabled ? "default" : "pointer",
            transition: "all 0.15s ease",
            marginTop: "8px",
          }}
        >
          회원가입
        </button>

        {/* 사장님(업주) 가입 안내 */}
        <button
          type="button"
          onClick={() => router.push(`/signup-owner?redirect=${redirect}`)}
          style={{
            width: "100%", padding: "12px", borderRadius: "10px",
            border: "1px solid #E4EBDC", background: "#F7F9F4",
            color: "#48603A", fontWeight: 700, fontSize: 13,
            cursor: "pointer", marginTop: "10px",
          }}
        >
          반려동물 동반 업장 사장님이신가요? 사장님으로 가입하기
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
  fontSize: "14px",
};

const errorTextStyle = {
  color: "#ef4444",
  fontSize: "13px",
  marginTop: "4px",
  marginBottom: "10px",
  fontWeight: 500,
};

const successTextStyle = {
  color: "#22c55e",
  fontSize: "13px",
  marginTop: "4px",
  marginBottom: "10px",
  fontWeight: 500,
};

const guideTextStyle = {
  fontSize: "12px",
  color: "#777",
  marginTop: "-6px",
  marginBottom: "14px",
  lineHeight: 1.4,
};

const eyeButtonStyle = {
  position: "absolute" as const,
  right: "14px",
  top: "50%",
  transform: "translateY(-50%)",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#777",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}