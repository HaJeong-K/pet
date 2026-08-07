"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { approveProposal } from "@/lib/approveProposal";
import {
  MapPin, Clock, Phone, ChefHat, LandPlot,
  Dog, Bone, MessageCircle, Plus, X, AlertCircle,
  MapPinPlus, CheckCircle2, XCircle, Search,
  Stethoscope, PawPrint, Pencil, Pill, Coffee, Trees, Hotel,
  Home, Building2,
} from "lucide-react";

// ── 카테고리 빠른 선택: 동물병원·동물약국 제보 시 전용 필드가 함께 열립니다.
const QUICK_CATEGORIES = [
  { value: "동물병원", label: "동물병원", icon: Stethoscope },
  { value: "동물약국", label: "동물약국", icon: Pill },
  { value: "카페/식당", label: "카페/식당", icon: Coffee },
  { value: "공원", label: "공원", icon: Trees },
  { value: "숙소", label: "숙소", icon: Hotel },
] as const;
const CUSTOM_CATEGORY = "__custom__";

/* ── 이미지 압축 ── */
const compressImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const MAX_PX = 1200, QUALITY = 0.85;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round((height * MAX_PX) / width); width = MAX_PX; }
        else { width = Math.round((width * MAX_PX) / height); height = MAX_PX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas context 없음")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("압축 실패")); },
        "image/jpeg", QUALITY,
      );
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = objectUrl;
  });

/* ── 비로그인 사용자 키 ── */
const getUserKey = () => {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem("user_key");
  if (!key) { key = crypto.randomUUID(); localStorage.setItem("user_key", key); }
  return key;
};

/* ── 공통 스타일 ── */
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: "10px",
  border: "1px solid #e2e4e8", fontSize: "13px", outline: "none",
  fontFamily: "'Noto Sans KR', sans-serif", background: "#f8fafc",
  boxSizing: "border-box", transition: "border-color 0.14s, background 0.14s",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, color: "#555", marginBottom: "6px",
  display: "flex", alignItems: "center", gap: "4px",
  fontFamily: "'Noto Sans KR', sans-serif",
};

/* ══════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════ */
export default function JeboModal() {
  const router = useRouter();

  /* ── 장소 기본 정보 ── */
  const [name,     setName]     = useState("");
  const [address,  setAddress]  = useState("");
  const [category, setCategory] = useState("");
  const [petZone,  setPetZone]  = useState<"indoor" | "terrace" | "both" | "">("");
  const [hours,    setHours]    = useState("");
  const [largeDog, setLargeDog] = useState<boolean | null>(null);
  const [petMenu,  setPetMenu]  = useState("");
  const [phone,    setPhone]    = useState("");
  const [memo,     setMemo]     = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  /* ── 동물병원 전용: 진료과목 · 가능 동물 ── */
  const [specialtyDepartment, setSpecialtyDepartment] = useState("");
  const [treatableAnimals,   setTreatableAnimals]     = useState("");
  const isVetHospitalTip = category === "동물병원";

  /* ── 이미지 ── */
  const [imageFiles,    setImageFiles]    = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── 카카오 주소 검색 스크립트 로드 ── */
  useEffect(() => {
    if (document.getElementById("kakao-postcode-script")) return; // 이미 로드된 경우 스킵
    const script = document.createElement("script");
    script.id  = "kakao-postcode-script";
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  /* ── 주소 검색 팝업 열기 ── */
  const handleAddressSearch = () => {
    if (!(window as any).daum?.Postcode) {
      alert("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        // 도로명 주소 우선, 없으면 지번 주소
        const selectedAddress = data.roadAddress || data.jibunAddress || data.address;
        setAddress(selectedAddress);
      },
      // 팝업 창 위치 설정
      popupTitle: "주소 검색",
    }).open();
  };

  /* ── 이미지 추가 ── */
  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드 가능합니다."); continue; }
      if (file.size > 10 * 1024 * 1024) { alert("10MB 이하의 이미지만 업로드 가능합니다."); continue; }
      if (imageFiles.length + newFiles.length >= 10) { alert("이미지는 최대 10장까지 첨부 가능합니다."); break; }
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    setImageFiles(prev => [...prev, ...newFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── 이미지 제거 ── */
  const removeImage = (idx: number) => {
    URL.revokeObjectURL(imagePreviews[idx]);
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── 제출 ── */
  const handleSubmit = async () => {
    if (!name.trim())    { alert("장소명을 입력해주세요."); return; }
    if (!address.trim()) { alert("주소를 입력해주세요."); return; }
    if (!petZone)        { alert("동반 가능 범위를 선택해주세요."); return; }
    if (imageFiles.length < 2) {
      alert("가게 내부 사진과 반려동물 동반 사진을 각 1장씩, 최소 2장을 첨부해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      /* 1. 이미지 업로드 */
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const compressed = await compressImage(file);
        const fileName = `tip_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("tip-images")
          .upload(fileName, compressed, { contentType: "image/jpeg", upsert: false });
        if (uploadError) {
          alert("이미지 업로드 중 오류가 발생했습니다. 다시 시도해주세요.");
          setIsSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("tip-images").getPublicUrl(fileName);
        if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl);
      }

      /* 2. DB 저장 */
      const userKey = getUserKey();
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id || null;

      // ★ 인증된 사장님이 직접 하는 제보는 관리자 제보관리 페이지에서 최우선으로
      //   노출되도록 표시해둡니다(요청: "사장님이 직접 신청했다는 걸 보여주면서
      //   가장 우선으로 처리를 원하도록 상단에 노출").
      let isOwnerRequest = false;
      if (authUserId) {
        const { data: ownerProfile } = await supabase
          .from("users").select("owner_status").eq("auth_user_id", authUserId).maybeSingle();
        isOwnerRequest = ownerProfile?.owner_status === "verified";
      }

      // ── 3. 필수 사진 2장(① 내부 전경 ② 반려동물 동반) AI 비전 자동 검증
      // 두 사진 모두 "적합"이고 확신도가 high일 때만 자동 승인 — 애매하면 항상
      // 기존처럼 관리자 수동 검토(status: "pending")로 넘깁니다. 이 호출이 실패하거나
      // (API 키 미설정 등) 타임아웃돼도 제보 접수 자체는 절대 막지 않습니다.
      let aiVerdict: { autoApprove: boolean; interiorOk: boolean; petOk: boolean; confidence: string; reasoning: string; skipped: boolean } | null = null;
      try {
        const verifyRes = await fetch("/api/jebo/verify-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interiorImageUrl: uploadedUrls[0], petImageUrl: uploadedUrls[1] }),
        });
        if (verifyRes.ok) aiVerdict = await verifyRes.json();
      } catch (e) {
        console.error("AI 이미지 검증 호출 실패(수동 검토로 진행):", e);
      }

      const autoApprove = !!aiVerdict?.autoApprove;

      const { data: insertedProposal, error } = await supabase
        .from("proposals")
        .insert([{
          place_name:   name.trim(),
          address:      address.trim(),
          category:     category.trim() || null,
          hours:        hours.trim()    || null,
          pet_zone:     petZone         || null,
          large_dog:    largeDog,
          pet_menu:     petMenu.trim()  || null,
          phone:        phone.trim()    || null,
          memo:         memo.trim()     || null,
          // 동물병원 제보 전용 필드(그 외 카테고리는 null로 저장)
          specialty_department: isVetHospitalTip ? (specialtyDepartment.trim() || null) : null,
          treatable_animals:    isVetHospitalTip ? (treatableAnimals.trim() || null) : null,
          image_urls:   uploadedUrls,
          reporter_key: userKey,
          auth_user_id: authUserId,   // ← 추가
          is_resolved:  false,
          status:       "pending",    // ← 항상 pending으로 저장 후, 자동승인 대상이면 아래에서 approveProposal이 approved로 갱신
          is_owner_request: isOwnerRequest, // ★ 인증된 사장님 본인 제보 여부
          ai_verified: false,
          ai_review: aiVerdict ? { ...aiVerdict } : null,
        }])
        .select()
        .single();

      if (error || !insertedProposal) { console.error("제보 저장 실패:", JSON.stringify(error, null, 2)); alert("제보 저장 중 오류가 발생했습니다."); return; }

      // ── 4. AI가 확실히 적합하다고 판단했으면 관리자 검토 없이 바로 지도에 등록
      if (autoApprove) {
        const approveResult = await approveProposal(supabase, insertedProposal, { autoApprovedByAi: true });
        if (approveResult.ok) {
          alert("사진 확인 결과 바로 등록 가능한 제보로 판단되어, 검토 없이 지도에 바로 등록되었습니다!\n제보해주셔서 감사합니다.");
          router.back();
          return;
        }
        // 좌표를 못 찾는 등으로 자동 등록에 실패하면 조용히 수동 검토(pending)로 남겨둡니다.
        console.error("AI 자동 승인 후 등록 실패, 수동 검토로 넘어갑니다:", approveResult);
      }

      alert("제보가 성공적으로 접수되었습니다!\n검토 후 지도에 등록하겠습니다. 감사합니다.");
      router.back();
    } catch (err) {
      console.error("제보 처리 오류:", err);
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !!(name.trim() && address.trim() && petZone && imageFiles.length >= 2 && !isSubmitting);

  const missingItems = [
    !name.trim()          && "장소명을 입력해주세요",
    !address.trim()       && "주소를 검색해주세요",
    !petZone              && "동반 가능 범위를 선택해주세요",
    imageFiles.length < 2 && `사진을 ${2 - imageFiles.length}장 더 첨부해주세요`,
  ].filter(Boolean) as string[];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        .jebo-input:focus { border-color: #7c3aed !important; background: white !important; }
        .zone-btn { transition: all 0.14s ease; }
        .zone-btn:hover { border-color: #888 !important; }
        .add-img-btn { transition: all 0.14s ease; }
        .add-img-btn:hover { border-color: #7c3aed !important; background: #f5f3ff !important; }
        .addr-search-btn:hover { background: #6d28d9 !important; }
        .submit-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }
        .submit-btn { transition: all 0.18s ease; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 999px; }
      `}</style>

      {/* ── 배경 오버레이 ── */}
      <div
        onClick={() => router.back()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.52)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
      >
        {/* ── 모달 카드 ── */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="ggk-body"
          style={{
            width: "100%", maxWidth: "500px", height: "92vh",
            background: "white", borderRadius: "22px",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
          }}
        >

          {/* ── 헤더 ── */}
          <div style={{
            padding: "14px 18px",
            borderBottom: "1px solid #eee",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: "rgba(124,58,237,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <MapPinPlus size={17} color="#7c3aed" />
              </div>
              <div>
                <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#3b0764", letterSpacing: "-0.3px" }}>
                  장소 제보하기
                </div>
                <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 500, marginTop: 1 }}>
                  반려동물과 함께할 수 있는 장소를 알려주세요
                </div>
              </div>
            </div>
            <button
              onClick={() => router.back()}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                border: "none", background: "rgba(0,0,0,0.1)",
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.14s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.18)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.1)")}
            >
              <X size={15} color="#5b21b6" />
            </button>
          </div>

          {/* ── 스크롤 콘텐츠 ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 48px", scrollbarWidth: "thin" }}>

            {/* 안내 배너 */}
            <div style={{
              padding: "11px 14px", background: "#eef6ff",
              borderRadius: 12, border: "1px solid #bfdbfe", marginBottom: 20,
              display: "flex", gap: 9, alignItems: "flex-start",
            }}>
              <AlertCircle size={13} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 11, color: "#1e40af", lineHeight: 1.75 }}>
                제보해주신 장소는 검토 후 지도에 등록됩니다.<br />
                <strong>장소명, 주소, 동반 범위, 사진 2장 이상</strong>은 필수 항목입니다.
              </div>
            </div>

            {/* ────── 장소명 * ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <MapPin size={11} color="#8b5cf6" />
                장소명 <span style={{ color: "#ef4444" }}>*</span>
              </div>
              <input
                className="jebo-input"
                placeholder="예: 강아지카페 멍멍이네"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* ────── 주소 * (카카오 주소 검색) ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <MapPin size={11} color="#8b5cf6" />
                주소 <span style={{ color: "#ef4444" }}>*</span>
              </div>

              {/* 검색 버튼 */}
              <button
                className="addr-search-btn ggk-body"
                onClick={handleAddressSearch}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                  color: "white", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", marginBottom: 8,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "background 0.14s",
                  fontFamily: "'Noto Sans KR', sans-serif",
                  boxShadow: "0 2px 8px rgba(124,58,237,0.28)",
                }}
              >
                <Search size={14} />
                주소 검색하기
              </button>

              {/* 선택된 주소 표시 or 직접 입력 */}
              <div style={{ position: "relative" }}>
                <input
                  readOnly
                  placeholder="위 버튼을 눌러 주소를 검색해주세요"
                  value={address}
                  onClick={handleAddressSearch}
                  style={{
                    ...inputStyle,
                    background: address ? "#f5f3ff" : "#f8fafc",
                    borderColor: address ? "#c4b5fd" : "#e2e4e8",
                    paddingRight: address ? "36px" : "13px",
                    cursor: "pointer",
                    caretColor: "transparent",
                  }}
                />
                {/* 주소 초기화 버튼 */}
                {address && (
                  <button
                    onClick={() => setAddress("")}
                    style={{
                      position: "absolute", right: 10, top: "50%",
                      transform: "translateY(-50%)",
                      border: "none", background: "transparent",
                      cursor: "pointer", padding: 2,
                      display: "flex", alignItems: "center",
                    }}
                  >
                    <X size={14} color="#a78bfa" />
                  </button>
                )}
              </div>

              {/* 주소 선택 완료 안내 */}
              {address && (
                <div style={{
                  marginTop: 6, padding: "6px 10px",
                  background: "#f5f3ff", borderRadius: 8,
                  border: "1px solid #ddd6fe",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <MapPin size={11} color="#7c3aed" />
                  <span style={{ fontSize: 11, color: "#6d28d9", fontWeight: 600 }}>
                    {address}
                  </span>
                </div>
              )}
            </div>

            {/* ────── 카테고리 ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><ChefHat size={11} color="#8b5cf6" /> 카테고리</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {QUICK_CATEGORIES.map((opt) => {
                  const Icon = opt.icon;
                  const active = category === opt.value && !useCustomCategory;
                  return (
                    <button
                      key={opt.value}
                      className="zone-btn ggk-body"
                      onClick={() => { setCategory(opt.value); setUseCustomCategory(false); }}
                      style={{
                        padding: "7px 12px", borderRadius: 999,
                        border: `1.5px solid ${active ? "#7c3aed" : "#e2e4e8"}`,
                        background: active ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "white",
                        color: active ? "white" : "#555",
                        fontWeight: 600, fontSize: 11, cursor: "pointer",
                        fontFamily: "'Noto Sans KR', sans-serif",
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <Icon size={12} />
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  className="zone-btn ggk-body"
                  onClick={() => { setUseCustomCategory(true); setCategory(""); }}
                  style={{
                    padding: "7px 12px", borderRadius: 999,
                    border: `1.5px solid ${useCustomCategory ? "#7c3aed" : "#e2e4e8"}`,
                    background: useCustomCategory ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "white",
                    color: useCustomCategory ? "white" : "#555",
                    fontWeight: 600, fontSize: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    fontFamily: "'Noto Sans KR', sans-serif",
                  }}
                >
                  <Pencil size={10} />직접입력
                </button>
              </div>
              {useCustomCategory && (
                <input
                  className="jebo-input"
                  placeholder="예: 카페, 레스토랑, 공원, 호텔 등"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ ...inputStyle, marginTop: 8 }}
                  autoFocus
                />
              )}
            </div>

            {/* ────── 동물병원 전용: 진료과목 · 가능 동물 ────── */}
            {isVetHospitalTip && (
              <div style={{
                marginBottom: 14, padding: "12px 13px", borderRadius: 12,
                background: "#eff6ff", border: "1px solid #bfdbfe",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                  <Stethoscope size={12} color="#1d4ed8" /> 동물병원 상세 정보 (선택)
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...labelStyle, color: "#1e40af" }}>
                    <Stethoscope size={11} color="#2563eb" /> 진료과목
                  </div>
                  <input
                    className="jebo-input"
                    placeholder="예: 심장내과 (특정 전문과가 없다면 비워두세요 → '종합진료'로 등록됩니다)"
                    value={specialtyDepartment}
                    onChange={(e) => setSpecialtyDepartment(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ ...labelStyle, color: "#1e40af" }}>
                    <PawPrint size={11} color="#2563eb" /> 가능 동물
                  </div>
                  <input
                    className="jebo-input"
                    placeholder="예: 강아지, 고양이, 소동물"
                    value={treatableAnimals}
                    onChange={(e) => setTreatableAnimals(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* ────── 동반 가능 범위 * (이모티콘 유지) ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><LandPlot size={11} color="#8b5cf6" /> 동반 가능 범위 <span style={{ color: "#ef4444" }}>*</span></div>
              <div style={{ display: "flex", gap: 7 }}>
                {([
                  { value: "indoor",  label: "실내 가능", icon: Home },
                  { value: "terrace", label: "테라스 가능", icon: Trees },
                  { value: "both",    label: "실내외 가능", icon: Building2 },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      className="zone-btn ggk-body"
                      onClick={() => setPetZone(opt.value)}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 10,
                        border: `1.5px solid ${petZone === opt.value ? "#7c3aed" : "#e2e4e8"}`,
                        background: petZone === opt.value ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "white",
                        color: petZone === opt.value ? "white" : "#555",
                        fontWeight: 600, fontSize: 11, cursor: "pointer",
                        fontFamily: "'Noto Sans KR', sans-serif",
                        boxShadow: petZone === opt.value ? "0 2px 8px rgba(124,58,237,0.28)" : "none",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                      }}
                    >
                      <Icon size={12} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ────── 영업시간 ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><Clock size={11} color="#8b5cf6" /> 영업시간</div>
              <input className="jebo-input" placeholder="예: 매일 10:00–22:00 / 월요일 휴무" value={hours} onChange={(e) => setHours(e.target.value)} style={inputStyle} />
            </div>

            {/* ────── 대형견 가능 여부 ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><Dog size={11} color="#8b5cf6" /> 대형견 동반 가능 여부</div>
              <div style={{ display: "flex", gap: 7 }}>
                <button
                  className="zone-btn ggk-body"
                  onClick={() => setLargeDog(true)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 10,
                    border: `1.5px solid ${largeDog === true ? "#16a34a" : "#e2e4e8"}`,
                    background: largeDog === true ? "linear-gradient(135deg, #22c55e, #16a34a)" : "white",
                    color: largeDog === true ? "white" : "#555",
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    boxShadow: largeDog === true ? "0 2px 8px rgba(22,163,74,0.28)" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  <CheckCircle2 size={14} color={largeDog === true ? "white" : "#22c55e"} />
                  가능
                </button>
                <button
                  className="zone-btn ggk-body"
                  onClick={() => setLargeDog(false)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 10,
                    border: `1.5px solid ${largeDog === false ? "#dc2626" : "#e2e4e8"}`,
                    background: largeDog === false ? "linear-gradient(135deg, #ef4444, #dc2626)" : "white",
                    color: largeDog === false ? "white" : "#555",
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    boxShadow: largeDog === false ? "0 2px 8px rgba(220,38,38,0.28)" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  <XCircle size={14} color={largeDog === false ? "white" : "#ef4444"} />
                  불가
                </button>
              </div>
            </div>

            {/* ────── 펫 메뉴 ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><Bone size={11} color="#8b5cf6" /> 펫 메뉴</div>
              <input className="jebo-input" placeholder="예: 멍푸치노, 수제간식 등" value={petMenu} onChange={(e) => setPetMenu(e.target.value)} style={inputStyle} />
            </div>

            {/* ────── 전화번호 ────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}><Phone size={11} color="#8b5cf6" /> 전화번호</div>
              <input className="jebo-input" placeholder="예: 02-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </div>

            {/* ────── 추가 메모 ────── */}
            <div style={{ marginBottom: 20 }}>
              <div style={labelStyle}><MessageCircle size={11} color="#8b5cf6" /> 추가 메모</div>
              <textarea
                className="jebo-input"
                placeholder="기타 방문 팁이나 추가 정보를 자유롭게 작성해주세요."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }}
              />
            </div>

            {/* ═══════════════ 이미지 업로드 ═══════════════ */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>
                <MapPinPlus size={11} color="#8b5cf6" />
                사진 첨부 <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontWeight: 500, color: "#999", marginLeft: 4 }}>({imageFiles.length} / 10장)</span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {imagePreviews.map((src, idx) => (
                  <div key={idx} style={{
                    position: "relative", width: 90, height: 90,
                    borderRadius: 11, overflow: "hidden",
                    border: "1px solid #e2e4e8", flexShrink: 0,
                    boxShadow: "0 1px 5px rgba(0,0,0,0.07)",
                  }}>
                    <img src={src} alt={`첨부 ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button
                      onClick={() => removeImage(idx)}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 20, height: 20, borderRadius: "50%",
                        border: "none", background: "rgba(0,0,0,0.58)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}
                    >
                      <X size={11} color="white" />
                    </button>
                    <div style={{
                      position: "absolute", bottom: 4, left: 4,
                      background: "rgba(0,0,0,0.52)", borderRadius: 999,
                      padding: "1px 6px", fontSize: 9, color: "white", fontWeight: 700,
                    }}>
                      {idx + 1}
                    </div>
                  </div>
                ))}
                {imageFiles.length < 10 && (
                  <button
                    className="add-img-btn ggk-body"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: 90, height: 90, borderRadius: 11,
                      border: "1.5px dashed #c4b5fd", background: "#faf5ff",
                      cursor: "pointer", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4,
                      color: "#a78bfa", fontSize: 10, fontWeight: 600,
                      fontFamily: "'Noto Sans KR', sans-serif",
                    }}
                  >
                    <Plus size={22} color="#a78bfa" />
                    사진 추가
                  </button>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageAdd} />

              {/* ★ 필수 이미지 안내 문구 ★ */}
              <div style={{ padding: "12px 14px", background: "#fff5f5", borderRadius: 11, border: "1px solid #fca5a5" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <AlertCircle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#dc2626", lineHeight: 1.75, fontFamily: "'Noto Sans KR', sans-serif" }}>
                    사진은 반드시 <strong>가게 내부 사진 1장</strong>과 <strong>반려동물과 함께 방문한 사진 1장</strong>을 포함해 <strong>최소 2장 이상</strong> 첨부하셔야 검토 후 승인이 가능합니다.
                  </p>
                </div>
                <p style={{ margin: "7px 0 0 21px", fontSize: 11, color: "#ef4444", lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 500 }}>
                  · 1번 사진: 가게 내부 전경 사진<br />
                  · 2번 사진: 반려동물과 함께 방문한 사진
                </p>
              </div>
            </div>

            {/* ── 제출 버튼 ── */}
            <button
              className="submit-btn ggk-body"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: "100%", padding: "14px", borderRadius: 13, border: "none",
                background: canSubmit ? "linear-gradient(145deg, #8b5cf6, #7c3aed)" : "#d1d5db",
                color: "white", fontWeight: 800, fontSize: 14,
                cursor: canSubmit ? "pointer" : "not-allowed",
                boxShadow: canSubmit ? "0 4px 18px rgba(124,58,237,0.38)" : "none",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              {isSubmitting ? "제보 접수 중... 잠시만 기다려주세요" : "제보 접수하기"}
            </button>

            {/* 미충족 조건 안내 */}
            {missingItems.length > 0 && (
              <div style={{ marginTop: 10, padding: "10px 13px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                {missingItems.map((item, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#999", lineHeight: 1.8, fontFamily: "'Noto Sans KR', sans-serif" }}>• {item}</div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}