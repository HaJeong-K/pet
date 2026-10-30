"use client";

import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Check, MapPin, BedDouble, Footprints, Heart } from "lucide-react";
import JoinLayout, { type JoinPoint } from "@/components/brand/JoinLayout";
import { CONTACT_USE_NOTE, formatPhone, isValidName, isValidPhone, normalizeName, normalizePhone } from "@/lib/contact";
import { TermsModal, PrivacyModal } from "@/components/SiteFooter";

// 왼쪽 칸에 보여 줄 "가입하면 쓸 수 있는 것"
const MEMBER_POINTS: JoinPoint[] = [
  { Icon: MapPin, title: "동반 가능한 곳을 지도로", text: "카페·식당·병원·공원까지, 반려동물과 갈 수 있는 곳을 한눈에 찾아요." },
  { Icon: BedDouble, title: "반려동물 동반 숙소 예약", text: "크기·마릿수·추가 요금을 미리 확인하고 바로 예약해요." },
  { Icon: Footprints, title: "산책 코스·커뮤니티", text: "산책 코스를 저장하고, 다른 보호자와 소식을 나눠요." },
  { Icon: Heart, title: "찜·후기·입양 공고", text: "가고 싶은 곳을 찜하고 후기를 남기고, 보호소 입양 공고도 볼 수 있어요." },
];

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  // 이름·휴대폰 번호 — 아이디(이메일) 찾기에만 씁니다(user_contacts 표, 본인만 읽기)
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [isNicknameTaken, setIsNicknameTaken] = useState(false);

  const [emailChecked, setEmailChecked] = useState(false);
  const [emailProvider, setEmailProvider] = useState<"none" | "email" | "kakao">("none");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── 약관 동의 ──
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const agreedAll = agreedTerms && agreedPrivacy;

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
    if (!email || !nickname || !password || !passwordConfirm || !realName || !phone) {
      alert("모든 항목을 입력해주세요.");
      return;
    }
    if (!isValidName(realName) || !isValidPhone(phone)) {
      alert("이름과 휴대폰 번호를 다시 확인해주세요.");
      return;
    }

    if (!agreedAll) {
      alert("이용약관과 개인정보 처리방침에 동의해주세요.");
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
        agreed_terms_at: new Date().toISOString(),
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

    // 아이디 찾기용 이름·번호 저장(로그인된 본인만 쓸 수 있는 표). 실패해도 가입은 끝난 것이라, 다음 로그인 때 다시 묻습니다(ContactPrompt).
    const { error: contactError } = await supabase.from("user_contacts").upsert({
      auth_user_id: data.user.id, name: normalizeName(realName), phone: normalizePhone(phone), updated_at: new Date().toISOString(),
    });
    if (contactError) console.error("user_contacts 저장 실패:", contactError);

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
    !isValidName(realName) ||
    !isValidPhone(phone) ||
    !password ||
    !passwordConfirm ||
    !isValidEmail(email) ||
    !isValidPassword(password) ||
    password !== passwordConfirm ||
    !agreedAll;

  return (
    <JoinLayout
      theme="oat"
      eyebrow="반려동물 보호자"
      EyebrowIcon={Heart}
      heading={["반려동물과 함께 갈 곳,", "같이가개에서 찾아요"]}
      points={MEMBER_POINTS}
      footnote={<>가입은 무료예요.<br />이메일은 로그인과 중요한 안내에만 써요.</>}
      label="같이가개 회원가입"
      title="이메일로 회원가입"
      sub="가입하면 찜·후기·숙소 예약·산책 코스 저장을 모두 쓸 수 있어요."
    >
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
              borderRadius: "12px",
              border: "none",
              background:
                !email || !isValidEmail(email) || isCheckingEmail
                  ? "#D6D3C9"
                  : "var(--join-strong)",
              color: !email || !isValidEmail(email) || isCheckingEmail ? "#4f4a3f" : "white",
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

        {/* 이름 · 휴대폰 번호 — 아이디(이메일) 찾기 전용 */}
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            id="signup-name"
            placeholder="이름"
            autoComplete="name"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            style={{ ...inputStyle, flex: "0 0 38%", minWidth: 0 }}
          />
          <input
            id="signup-phone"
            placeholder="휴대폰 번호"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          />
        </div>
        {phone && !isValidPhone(phone) && (
          <p style={errorTextStyle}>휴대폰 번호를 다시 확인해주세요.</p>
        )}
        <p style={guideTextStyle}>
          {CONTACT_USE_NOTE} 다른 회원에게는 보이지 않아요.
        </p>

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

        {/* 약관 동의 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, marginBottom: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer" }}>
            <button
              type="button"
              onClick={() => setAgreedTerms((v) => !v)}
              style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1.5px solid ${agreedTerms ? "var(--join-strong)" : "#ccc"}`,
                background: agreedTerms ? "var(--join-strong)" : "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              }}
            >
              {agreedTerms && <Check size={12} color="white" />}
            </button>
            <span>
              (필수) <button type="button" onClick={() => setShowTermsModal(true)} style={{ border: "none", background: "transparent", color: "var(--join-strong)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12.5 }}>이용약관</button>에 동의합니다
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer" }}>
            <button
              type="button"
              onClick={() => setAgreedPrivacy((v) => !v)}
              style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1.5px solid ${agreedPrivacy ? "var(--join-strong)" : "#ccc"}`,
                background: agreedPrivacy ? "var(--join-strong)" : "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              }}
            >
              {agreedPrivacy && <Check size={12} color="white" />}
            </button>
            <span>
              (필수) <button type="button" onClick={() => setShowPrivacyModal(true)} style={{ border: "none", background: "transparent", color: "var(--join-strong)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12.5 }}>개인정보 처리방침</button>에 동의합니다
            </span>
          </label>
        </div>

        {/* 회원가입 버튼 */}
        <button
          onClick={handleSignup}
          disabled={isSubmitDisabled}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "14px",
            border: "none",
            background: isSubmitDisabled ? "#D6D3C9" : "var(--join-btn)",
            boxShadow: isSubmitDisabled ? "none" : "0 10px 22px rgba(0,0,0,0.14)",
            fontSize: "15.5px",
            color: isSubmitDisabled ? "#4f4a3f" : "white",
            fontWeight: 800,
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
            width: "100%", padding: "12px", borderRadius: "14px",
            border: "1px solid var(--join-soft-line)", background: "var(--join-soft)",
            color: "var(--join-soft-ink)", fontWeight: 700, fontSize: 13,
            cursor: "pointer", marginTop: "10px",
          }}
        >
          반려동물 동반 업장 사장님이신가요? 사장님으로 가입하기
        </button>

        <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: 13, color: "#625a4c" }}>
          이미 계정이 있으신가요?{" "}
          <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} style={{ color: "var(--join-strong)", fontWeight: 800 }}>로그인</Link>
        </p>

      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </JoinLayout>
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
  color: "#dc2626",
  fontSize: "13px",
  marginTop: "4px",
  marginBottom: "10px",
  fontWeight: 500,
};

const successTextStyle = {
  color: "#15803d",
  fontSize: "13px",
  marginTop: "4px",
  marginBottom: "10px",
  fontWeight: 500,
};

const guideTextStyle = {
  fontSize: "12px",
  color: "#555",
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
  color: "#555",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}