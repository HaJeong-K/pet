"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Check, MapPin, Upload } from "lucide-react";
import { PrivacyModal } from "@/components/SiteFooter";

// ── 이미 로그인된 일반 회원이 "사장님"으로 전환할 때 쓰는 폼입니다.
// OwnerSignupForm.tsx(비회원용 사장님 가입)과 사업장 정보 입력·OCR 자동대조 로직은
// 동일하지만, 여기서는 이미 계정이 있으므로 이메일/비밀번호/이용약관 재동의 단계를
// 생략하고 사업장 정보 + 사업자등록증만 받습니다. 제출 시 auth.signUp으로 새 계정을
// 만드는 대신, 기존 users 행(auth_user_id=현재 로그인 사용자)을 owner_* 필드로
// update합니다 — 닉네임도 다른 사장님 계정과 동일하게 [지역명]가게명_사장님 형식으로
// 고정됩니다(사장님 계정 전반의 일관된 규칙, mypage.tsx가 nickname_locked를 보고
// 닉네임 변경 메뉴를 숨김).
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
const normText = (s: string) => (s || "").replace(/\s+/g, "").replace(/[()（）·,]/g, "").toLowerCase();

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

export default function OwnerUpgradeForm({
  userId,
  onDone,
}: {
  userId: string;
  onDone: (result: { verified: boolean }) => void;
}) {
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

  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<"idle" | "uploading" | "verifying">("idle");

  useEffect(() => {
    loadDaumPostcode().catch((e) => console.error("다음 주소검색 로드 실패:", e));
    loadTesseract().catch((e) => console.error("OCR 스크립트 로드 실패:", e));
  }, []);

  const nicknamePreview =
    sido && businessName.trim() ? `[${sido}]${businessName.trim()}_사장님` : "";

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
  };

  const isSubmitDisabled =
    !sido || !sigungu || !roadAddress ||
    !addressDetail.trim() ||
    !businessName.trim() ||
    !phone.trim() ||
    !certFile ||
    !agreedPrivacy ||
    submitting;

  const handleSubmit = async () => {
    if (isSubmitDisabled || !certFile) return;
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

      const fullAddress = `${roadAddress} ${addressDetail.trim()}`;
      const ext = (certFile.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${userId}/cert-${Date.now()}.${ext}`;

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

      const { error: updateError } = await supabase.from("users").update({
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
      }).eq("auth_user_id", userId);

      if (updateError) {
        console.error("사장님 전환 users update 실패:", updateError);
        alert("가입 정보 저장 중 오류가 발생했습니다.");
        return;
      }

      await supabase.auth.updateUser({ data: { full_name: nicknamePreview, nickname: nicknamePreview } });

      if (autoVerified) {
        alert(
          "사업자등록증 확인이 완료되어 사장님 계정이 즉시 활성화되었습니다.\n인증 배지와 본인 업장 수정 권한을 바로 사용하실 수 있습니다."
        );
      } else {
        alert(
          "사장님 전환 신청이 접수되었습니다.\n사업자등록증 자동 대조에 실패하여 관리자 확인 후 승인됩니다."
        );
      }
      onDone({ verified: autoVerified });
    } finally {
      setSubmitting(false);
      setSubmitPhase("idle");
    }
  };

  return (
    <div style={{ maxHeight: "82vh", overflowY: "auto", paddingRight: 2 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>사장님으로 전환하기</h1>
      <p style={{ fontSize: 12.5, color: "#555", marginBottom: 20, lineHeight: 1.5 }}>
        현재 계정을 유지한 채로 사장님 계정으로 전환합니다. 사업자등록증 대조가 확인되면
        즉시, 확인이 안 되면 관리자 승인 후 인증 배지·본인 업장 정보 수정·사장님 게시판
        글쓰기 권한이 주어집니다. 전환 시 닉네임은 <strong>[지역명]가게명_사장님</strong> 형식으로
        바뀝니다.
      </p>

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
          전환 후 닉네임: <strong>{nicknamePreview}</strong> (전환 후 변경 불가)
        </div>
      )}

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 6 }}>사업자등록증 업로드 (필수)</div>
      <p style={{ fontSize: 11.5, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
        업로드한 사업자등록증의 상호명·주소가 입력하신 정보와 자동으로 대조됩니다.
        일치하면 즉시 전환 승인, 일치하지 않으면 관리자 확인 후 승인됩니다.
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
        검색해도 안 나오면 전환 후 마이페이지에서 &apos;제보하기&apos;로 신규 등록을 요청해주세요.
      </p>

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer", marginBottom: 14 }}>
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

      <button onClick={handleSubmit} disabled={isSubmitDisabled} style={{
        width: "100%", padding: 14, borderRadius: 10, border: "none",
        background: isSubmitDisabled ? "#ccc" : "#5C7A4A", color: "white",
        fontWeight: 700, cursor: isSubmitDisabled ? "default" : "pointer",
      }}>
        {submitPhase === "uploading" && "제출 중..."}
        {submitPhase === "verifying" && "사업자등록증 대조 중..."}
        {submitPhase === "idle" && "사장님으로 전환하기"}
      </button>

      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: 14, marginBottom: 12, borderRadius: 10,
  border: "1px solid #ddd", boxSizing: "border-box" as const, fontSize: 14,
};
const searchBtnStyle = {
  width: 46, borderRadius: 10, border: "1px solid #ddd", background: "white",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#555",
};
