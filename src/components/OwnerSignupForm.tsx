"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Search, Check, MapPin, Upload } from "lucide-react";
import { TermsModal, PrivacyModal } from "@/components/SiteFooter";

// 다음 주소검색 API가 돌려주는 시/도 표기가 지역마다 풀네임/축약형이 섞여 있어
// 기존 닉네임 규칙([지역명]가게명_사장님, 예: "경남")과 맞추기 위해 정규화합니다.
const SIDO_NORMALIZE: Record<string, string> = {
  "서울": "서울", "서울특별시": "서울",
  "부산": "부산", "부산광역시": "부산",
  "대구": "대구", "대구광역시": "대구",
  "인천": "인천", "인천광역시": "인천",
  "광주": "광주", "광주광역시": "광주",
  "대전": "대전", "대전광역시": "대전",
  "울산": "울산", "울산광역시": "울산",
  "세종": "세종", "세종특별자치시": "세종",
  "경기": "경기", "경기도": "경기",
  "강원": "강원", "강원도": "강원", "강원특별자치도": "강원",
  "충북": "충북", "충청북도": "충북",
  "충남": "충남", "충청남도": "충남",
  "전북": "전북", "전라북도": "전북", "전북특별자치도": "전북",
  "전남": "전남", "전라남도": "전남",
  "경북": "경북", "경상북도": "경북",
  "경남": "경남", "경상남도": "경남",
  "제주": "제주", "제주도": "제주", "제주특별자치도": "제주",
};
const normalizeSido = (s: string) => SIDO_NORMALIZE[s] || s;

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password: string) => /^(?=.*[a-z]).{6,}$/.test(password);

// 텍스트 비교용 정규화 — 공백/일부 기호 제거 후 소문자로
const normText = (s: string) => (s || "").replace(/\s+/g, "").replace(/[()（）·,]/g, "").toLowerCase();

// ── 다음(Daum) 우편번호 서비스 동적 로드 ──
function loadDaumPostcode(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).daum?.Postcode) { resolve((window as any).daum); return; }
    const existing = document.getElementById("daum-postcode-script");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).daum));
      return;
    }
    const script = document.createElement("script");
    script.id = "daum-postcode-script";
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = () => resolve((window as any).daum);
    script.onerror = () => reject(new Error("주소 검색 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
}

// ── Tesseract.js 동적 로드 + OCR (사업자등록증 자동대조용) ──
function loadTesseract(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) { resolve((window as any).Tesseract); return; }
    const existing = document.getElementById("tesseract-script");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Tesseract));
      return;
    }
    const script = document.createElement("script");
    script.id = "tesseract-script";
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error("OCR 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
}

async function runOcr(file: File): Promise<string> {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, "kor+eng");
  return data?.text || "";
}

// ── 사장님(업주) 회원가입 ──
// 일반 회원가입과 달리: (1) 지역+가게명으로 닉네임이 [지역명]가게명_사장님 형태로 자동
// 고정되고(가입 후 변경 불가), (2) 사업자등록증 업로드가 필수이며 업로드된 이미지를
// OCR로 읽어 입력한 가게명·주소와 대조해 일치하면 즉시 자동 승인(owner_status='verified'),
// 불일치하면 owner_status='pending'으로 저장되어 관리자 수동 승인을 거칩니다.
export default function OwnerSignupForm({ redirect = "/" }: { redirect?: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── 이메일 중복 확인 — 일반 회원가입 모달(@modal/(.)signup)과 동일한 check_email_exists
  // RPC를 씁니다. 예전엔 여기서 별도 확인 없이 바로 auth.signUp을 호출해서 Supabase가
  // 돌려주는 영문 에러 메시지를 그대로 보여줬는데, 일반 가입 흐름과 다르게 느껴져서
  // 통일했습니다.
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailProvider, setEmailProvider] = useState<"none" | "email" | "kakao">("none");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [roadAddress, setRoadAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPreviewUrl, setCertPreviewUrl] = useState<string | null>(null);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<{ id: number; name: string; address: string }[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ id: number; name: string; address: string } | null>(null);
  const [searching, setSearching] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<"idle" | "uploading" | "verifying">("idle");

  // ── 약관 동의 ──
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const agreedAll = agreedTerms && agreedPrivacy;

  // ⚠ 최적화: Tesseract.js는 사업자등록증 이미지를 실제로 골랐을 때만 필요한데, 예전엔
  // 폼이 열리자마자(마운트 시) 무조건 미리 받아왔습니다 — 회원가입 폼만 열어보고 이미지를
  // 안 올리는 사람도 수 MB짜리 OCR 스크립트를 다운로드하게 되는 낭비였습니다. 이제는
  // handleCertChange(실제 파일 선택 시점)에서 로드를 시작합니다(다음 주소검색은 대부분의
  // 사용자가 곧바로 쓰는 흐름이라 그대로 미리 받아둡니다).
  useEffect(() => {
    loadDaumPostcode().catch((e) => console.error("다음 주소검색 로드 실패:", e));
  }, []);

  const nicknamePreview =
    sido && businessName.trim() ? `[${sido}]${businessName.trim()}_사장님` : "";

  const checkEmailDuplicate = async () => {
    if (!email || !isValidEmail(email)) return;
    setIsCheckingEmail(true);
    const { data, error } = await supabase.rpc("check_email_exists", { p_email: email });
    setIsCheckingEmail(false);
    if (error) {
      console.error("이메일 중복검사 오류:", error);
      return;
    }
    setEmailProvider(data as "none" | "email" | "kakao");
    setEmailChecked(true);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailChecked(false);
    setEmailProvider("none");
  };

  const openAddressSearch = async () => {
    try {
      const daum = await loadDaumPostcode();
      new daum.Postcode({
        oncomplete: (data: any) => {
          setSido(normalizeSido(data.sido || ""));
          setSigungu(data.sigungu || "");
          setRoadAddress(data.roadAddress || data.jibunAddress || data.address || "");
        },
      }).open();
    } catch {
      alert("주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const searchPlace = async () => {
    if (!placeQuery.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("places")
      .select("id, name, address")
      .ilike("name", `%${placeQuery.trim()}%`)
      .limit(8);
    setPlaceResults(data || []);
    setSearching(false);
  };

  const handleCertChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setCertFile(file);
    if (certPreviewUrl) URL.revokeObjectURL(certPreviewUrl);
    setCertPreviewUrl(file ? URL.createObjectURL(file) : null);
    // 실제로 파일을 고른 시점에만 OCR 스크립트를 미리 받아둡니다(제출 시 runOcr가
    // 다시 loadTesseract를 부르지만, 이미 로드돼 있으면 즉시 반환되므로 중복 비용 없음).
    if (file) loadTesseract().catch((e2) => console.error("OCR 스크립트 로드 실패:", e2));
  };

  const isSubmitDisabled =
    !email || !isValidEmail(email) ||
    !emailChecked || emailProvider !== "none" ||
    !password || !isValidPassword(password) ||
    password !== passwordConfirm ||
    !sido || !sigungu || !roadAddress ||
    !addressDetail.trim() ||
    !businessName.trim() ||
    !phone.trim() ||
    !certFile ||
    !agreedAll ||
    submitting;

  const handleSubmit = async () => {
    if (isSubmitDisabled || !certFile) return;
    if (!emailChecked || emailProvider !== "none") {
      alert("이메일 중복 확인을 먼저 완료해주세요.");
      return;
    }
    setSubmitting(true);
    setSubmitPhase("uploading");
    try {
      const { data: nicknameData } = await supabase.rpc("check_nickname_exists", {
        p_nickname: nicknamePreview,
      });
      if (nicknameData === true) {
        alert("이미 같은 이름의 사장님 계정이 등록돼 있습니다. 관리자에게 문의해주세요.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nicknamePreview, nickname: nicknamePreview } },
      });
      if (error) { alert(error.message); return; }
      if (!data.user) { alert("가입에 실패했습니다."); return; }

      const fullAddress = `${roadAddress} ${addressDetail.trim()}`;
      const ext = (certFile.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${data.user.id}/cert-${Date.now()}.${ext}`;

      setSubmitPhase("verifying");
      const [uploadResult, ocrText] = await Promise.all([
        supabase.storage.from("owner-docs").upload(fileName, certFile, {
          contentType: certFile.type || "image/jpeg",
          upsert: false,
        }),
        runOcr(certFile).catch((e) => { console.error("사업자등록증 OCR 실패:", e); return ""; }),
      ]);

      if (uploadResult.error) {
        console.error("사업자등록증 업로드 실패:", uploadResult.error);
        alert("사업자등록증 업로드에 실패했습니다. 다시 시도해주세요.");
        return;
      }

      const { data: urlData } = supabase.storage.from("owner-docs").getPublicUrl(fileName);
      const certUrl = urlData.publicUrl;

      const ocrNorm = normText(ocrText);
      const nameMatch = Boolean(businessName.trim()) && ocrNorm.includes(normText(businessName.trim()));
      const sigunguMatch = Boolean(sigungu) && ocrNorm.includes(normText(sigungu));
      const autoVerified = nameMatch && sigunguMatch;

      const { error: insertError } = await supabase.from("users").insert([
        {
          auth_user_id: data.user.id,
          email,
          nickname: nicknamePreview,
          nickname_locked: true,
          owner_status: autoVerified ? "verified" : "pending",
          owner_business_name: businessName.trim(),
          owner_region: sido,
          owner_sigungu: sigungu,
          owner_address_detail: fullAddress,
          owner_phone: phone.trim(),
          owner_place_id: selectedPlace?.id ?? null,
          owner_cert_url: certUrl,
          owner_auto_verified: autoVerified,
          owner_ocr_text: ocrText ? ocrText.slice(0, 2000) : null,
          agreed_terms_at: new Date().toISOString(),
        },
      ]);
      if (insertError) {
        console.error("사장님 가입 users insert 실패:", insertError);
        alert("가입 정보 저장 중 오류가 발생했습니다.");
        return;
      }

      await new Promise((r) => setTimeout(r, 600));
      await supabase.auth.signInWithPassword({ email, password });

      if (autoVerified) {
        alert(
          "사업자등록증 확인이 완료되어 사장님 계정이 즉시 활성화되었습니다.\n인증 배지와 본인 업장 수정 권한을 바로 사용하실 수 있습니다."
        );
      } else {
        alert(
          "사장님 가입 신청이 접수되었습니다.\n사업자등록증 자동 대조에 실패하여 관리자 확인 후 승인됩니다."
        );
      }
      window.location.href = redirect;
    } finally {
      setSubmitting(false);
      setSubmitPhase("idle");
    }
  };

  return (
    <div style={{ maxHeight: "82vh", overflowY: "auto", paddingRight: 2 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>사장님으로 가입하기</h1>
      <p style={{ fontSize: 12.5, color: "#555", marginBottom: 20, lineHeight: 1.5 }}>
        반려동물 동반 가능 업장을 운영하신다면 사장님 계정으로 가입해주세요.
        사업자등록증 대조가 확인되면 즉시, 확인이 안 되면 관리자 승인 후 인증 배지·본인 업장 정보 수정·사장님 게시판 글쓰기 권한이 주어집니다.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="이메일" value={email} onChange={handleEmailChange} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
        <button
          type="button"
          onClick={checkEmailDuplicate}
          disabled={!email || !isValidEmail(email) || isCheckingEmail}
          style={{
            padding: "0 14px", borderRadius: 10, border: "none",
            background: !email || !isValidEmail(email) || isCheckingEmail ? "#ccc" : "#111",
            color: "white", fontWeight: 700, fontSize: 13,
            cursor: !email || !isValidEmail(email) || isCheckingEmail ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isCheckingEmail ? "확인 중..." : "중복 확인"}
        </button>
      </div>
      {email && !isValidEmail(email) && <p style={errorTextStyle}>이메일을 다시 확인해주세요.</p>}
      {emailChecked && (
        <p style={emailProvider !== "none" ? errorTextStyle : successTextStyle}>
          {emailProvider === "email" && "이미 사용중인 이메일입니다."}
          {emailProvider === "kakao" && "카카오 계정으로 가입된 이메일입니다."}
          {emailProvider === "none" && "사용 가능한 이메일입니다."}
        </p>
      )}

      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          type={showPassword ? "text" : "password"}
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0, paddingRight: 48 }}
        />
        <button type="button" onClick={() => setShowPassword((v) => !v)} style={eyeButtonStyle}>
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {password && !isValidPassword(password) && (
        <p style={errorTextStyle}>영문 소문자 포함 6자 이상이어야 합니다.</p>
      )}

      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          type={showConfirmPassword ? "text" : "password"}
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0, paddingRight: 48 }}
        />
        <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} style={eyeButtonStyle}>
          {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {passwordConfirm && password !== passwordConfirm && (
        <p style={errorTextStyle}>비밀번호가 일치하지 않습니다.</p>
      )}

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 6 }}>사업장 주소</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          readOnly
          placeholder="주소 검색 버튼을 눌러 도로명주소를 찾아주세요"
          value={roadAddress}
          style={{ ...inputStyle, marginBottom: 0, flex: 1, background: "#f7f8f9", color: roadAddress ? "#333" : "#999", cursor: "pointer" }}
          onClick={openAddressSearch}
        />
        <button type="button" onClick={openAddressSearch} style={{ ...searchBtnStyle, width: 96, gap: 6, fontSize: 12.5, fontWeight: 700 }}>
          <MapPin size={14} />주소 검색
        </button>
      </div>
      {sido && sigungu && (
        <div style={{ fontSize: 12, color: "#48603A", fontWeight: 700, marginBottom: 10 }}>{sido} {sigungu}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="가게명"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
        />
        <input
          placeholder="상세주소 (건물, 층, 호수 등)"
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
        />
      </div>

      <input placeholder="가게 연락처" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />

      {nicknamePreview && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#E4EBDC", marginBottom: 14, fontSize: 12.5, color: "#48603A" }}>
          가입 시 닉네임: <strong>{nicknamePreview}</strong> (가입 후 변경 불가)
        </div>
      )}

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 6 }}>사업자등록증 업로드 (필수)</div>
      <p style={{ fontSize: 11.5, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
        업로드한 사업자등록증의 상호명·주소가 입력하신 정보와 자동으로 대조됩니다.
        일치하면 즉시 가입 승인, 일치하지 않으면 관리자 확인 후 승인됩니다.
      </p>
      <label
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px", borderRadius: 10, border: "1.5px dashed #ccc",
          background: "#fafafa", color: "#555", fontSize: 13, fontWeight: 600,
          cursor: "pointer", marginBottom: 10,
        }}
      >
        <Upload size={16} />
        {certFile ? certFile.name : "사업자등록증 이미지 선택"}
        <input type="file" accept="image/*" onChange={handleCertChange} style={{ display: "none" }} />
      </label>
      {certPreviewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={certPreviewUrl}
          alt="사업자등록증 미리보기"
          style={{ width: "100%", maxHeight: 200, objectFit: "contain", border: "1px solid #eee", borderRadius: 10, marginBottom: 14, background: "#fafafa" }}
        />
      )}

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 6 }}>
        지도에 이미 등록된 내 업장 연결 (선택)
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="가게명으로 검색"
          value={placeQuery}
          onChange={(e) => setPlaceQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchPlace()}
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
        />
        <button type="button" onClick={searchPlace} disabled={searching} style={searchBtnStyle}>
          <Search size={15} />
        </button>
      </div>

      {selectedPlace && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "#f0f9f4", border: "1px solid #bbf0d1", marginBottom: 10, fontSize: 12 }}>
          <Check size={14} color="#22c55e" />
          <span style={{ flex: 1 }}>{selectedPlace.name} · {selectedPlace.address}</span>
          <button type="button" onClick={() => setSelectedPlace(null)} style={{ border: "none", background: "transparent", color: "#999", cursor: "pointer", fontSize: 11 }}>취소</button>
        </div>
      )}

      {!selectedPlace && placeResults.length > 0 && (
        <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
          {placeResults.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedPlace(p); setPlaceResults([]); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "white", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f2f2f2" }}
            >
              {p.name} <span style={{ color: "#777" }}>· {p.address}</span>
            </button>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: "#777", marginBottom: 18, lineHeight: 1.5 }}>
        검색해도 안 나오면 가입 후 마이페이지에서 &apos;제보하기&apos;로 신규 등록을 요청해주세요 —
        사장님 계정으로 제보하면 관리자 검토 시 최우선으로 표시됩니다.
      </p>

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      {/* 약관 동의 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer" }}>
          <button
            type="button"
            onClick={() => setAgreedTerms((v) => !v)}
            style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `1.5px solid ${agreedTerms ? "#5C7A4A" : "#ccc"}`,
              background: agreedTerms ? "#5C7A4A" : "white",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            }}
          >
            {agreedTerms && <Check size={12} color="white" />}
          </button>
          <span>
            (필수) <button type="button" onClick={() => setShowTermsModal(true)} style={{ border: "none", background: "transparent", color: "#111", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12.5 }}>이용약관</button>에 동의합니다
          </span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer" }}>
          <button
            type="button"
            onClick={() => setAgreedPrivacy((v) => !v)}
            style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `1.5px solid ${agreedPrivacy ? "#5C7A4A" : "#ccc"}`,
              background: agreedPrivacy ? "#5C7A4A" : "white",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            }}
          >
            {agreedPrivacy && <Check size={12} color="white" />}
          </button>
          <span>
            (필수) <button type="button" onClick={() => setShowPrivacyModal(true)} style={{ border: "none", background: "transparent", color: "#111", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12.5 }}>개인정보 처리방침</button>에 동의합니다 (사업자등록증 이미지·OCR 텍스트 처리 포함)
          </span>
        </label>
      </div>

      <button onClick={handleSubmit} disabled={isSubmitDisabled} style={{
        width: "100%", padding: 14, borderRadius: 10, border: "none",
        background: isSubmitDisabled ? "#ccc" : "#5C7A4A", color: "white",
        fontWeight: 700, cursor: isSubmitDisabled ? "default" : "pointer",
      }}>
        {submitPhase === "uploading" && "제출 중..."}
        {submitPhase === "verifying" && "사업자등록증 대조 중..."}
        {submitPhase === "idle" && "사장님으로 가입하기"}
      </button>

      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: 14, marginBottom: 12, borderRadius: 10,
  border: "1px solid #ddd", boxSizing: "border-box" as const, fontSize: 14,
};
const errorTextStyle = { color: "#ef4444", fontSize: 13, marginTop: -6, marginBottom: 10, fontWeight: 500 };
const successTextStyle = { color: "#22c55e", fontSize: 13, marginTop: -6, marginBottom: 10, fontWeight: 500 };
const eyeButtonStyle = {
  position: "absolute" as const, right: 14, top: "50%", transform: "translateY(-50%)",
  border: "none", background: "transparent", cursor: "pointer", padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center", color: "#777",
};
const searchBtnStyle = {
  width: 46, borderRadius: 10, border: "1px solid #ddd", background: "white",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#555",
};
