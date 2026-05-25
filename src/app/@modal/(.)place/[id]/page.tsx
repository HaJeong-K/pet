"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  MoreVertical, Link, Upload, MessageCircle as KakaoIcon,
  X, Flag, Share2, AlertTriangle, ChevronDown,
  DoorOpen, PawPrint, Store, Info, ThumbsDown,
  Copy, AlertOctagon, MessageSquare,
} from "lucide-react";
import PlaceDetail from "@/app/place/[id]/page";
import { supabase } from "@/lib/supabase";

/* ── 장소 신고 사유 목록 ─────────────────────────────── */
const PLACE_REPORT_CATEGORIES = [
  { value: "closed",        label: "폐업했어요",                                          icon: DoorOpen      },
  { value: "no_pets",       label: "반려동물 동반이 불가능해졌어요",                         icon: PawPrint      },
  { value: "changed",       label: "업종이 변경되었어요",                                   icon: Store         },
  { value: "wrong_info",    label: "가게 정보(영업시간, 주소 등)가 잘못되었어요",              icon: Info          },
  { value: "different",     label: "실제 방문 시 정보와 달라요",                             icon: ThumbsDown    },
  { value: "duplicate",     label: "중복 등록된 장소예요",                                  icon: Copy          },
  { value: "inappropriate", label: "허위/부적절한 장소예요",                                icon: AlertOctagon  },
  { value: "etc",           label: "기타",                                                icon: MessageSquare },
];

/* ── localStorage user_key ───────────────────────────── */
const getUserKey = () => {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem("user_key");
  if (!key) { key = crypto.randomUUID(); localStorage.setItem("user_key", key); }
  return key;
};

/* ══════════════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════════════ */
export default function ModalPage() {
  const router  = useRouter();
  const params  = useParams();
  const placeId = params?.id as string | undefined;
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/?placeId=${placeId}`
    : `/?placeId=${placeId}`;

  const [placeName, setPlaceName] = useState<string>("");
  useEffect(() => {
    if (!placeId) return;
    supabase
      .from("places")
      .select("name")
      .eq("id", placeId)
      .single()
      .then(({ data }) => {
        if (data?.name) setPlaceName(data.name);
      });
  }, [placeId]);

  /* 메뉴 & 모달 상태 */
  const [showMenu,        setShowMenu]        = useState(false);
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  /* 신고 폼 */
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason,   setReportReason]   = useState("");
  const [isSubmitting,   setIsSubmitting]   = useState(false);

  /* ── 공유 핸들러 ── */
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("링크가 복사되었습니다.");
    } catch {
      alert("링크 복사에 실패했습니다.");
    }
    setShowShareModal(false);
  };

  const handleSnsShare = () => {
    if (navigator.share) {
      navigator.share({
        title: placeName ? `${placeName} - 같이가개` : "같이가개",  // ← 변경
        text: placeName
          ? `${placeName} 반려동물과 함께 가볼 수 있는 장소예요! 같이가개에서 확인해보세요.`
          : "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",  // ← 변경
        url: shareUrl,
      });
    } else {
      alert("SNS 공유가 지원되지 않는 브라우저입니다.");
    }
    setShowShareModal(false);
  };

  const handleKakaoShare = () => {
    if (!(window as any).Kakao) {
      alert("카카오톡 공유를 사용할 수 없습니다.");
      return;
    }
    (window as any).Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: placeName ? `${placeName} - 같이가개` : "같이가개",  // ← 변경
        description: placeName
          ? `${placeName} 반려동물과 함께 가볼 수 있는 장소예요! 같이가개에서 확인해보세요.`
          : "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",  // ← 변경
        imageUrl: "",
        link: {
          mobileWebUrl: shareUrl,
          webUrl: shareUrl,
        },
      },
    });
    setShowShareModal(false);
  };

  /* ── 신고 핸들러 ── */
  const handleReportSubmit = async () => {
    if (!reportCategory || !reportReason.trim()) return;

    setIsSubmitting(true);

    try {
      const userKey = getUserKey();

      // ★ 닉네임 가져오기
      let nickname = "익명";

      const { data: sessionData } = await supabase.auth.getSession();

      if (sessionData.session?.user?.id) {
        const { data: userData } = await supabase
          .from("users")
          .select("nickname")
          .eq("auth_user_id", sessionData.session.user.id)
          .maybeSingle();

        if (userData?.nickname) {
          nickname = userData.nickname;
        }
      }

      const { data, error } = await supabase
        .from("reports")
        .insert([
          {
            type: "place",
            target_id: String(placeId),
            place_id: Number(placeId),

            reporter_key: userKey,

            // ★ 추가
            nickname: nickname,

            report_category: reportCategory,
            report_reason: reportReason.trim(),
          },
        ])
        .select();

      console.log("insert 결과 data:", data);
      console.log("insert 결과 error:", JSON.stringify(error, null, 2));

      if (error) {
        console.error("장소 신고 오류:", error);
        return;
      }

      alert("장소 신고가 정상적으로 접수되었습니다.\n검토 후 처리하겠습니다.");

      setShowReportModal(false);
      setReportCategory("");
      setReportReason("");

    } finally {
      setIsSubmitting(false);
    }
  };

  const closeReport = () => {
    setShowReportModal(false);
    setReportCategory("");
    setReportReason("");
  };

  /* ── JSX ── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .modal-menu-item { transition: background 0.12s ease; }
        .modal-menu-item:hover { background: #f5f6f8 !important; }
        .share-row { transition: background 0.12s ease; }
        .share-row:hover { background: #f5f6f8 !important; }
        .report-cat-btn { transition: all 0.14s ease; }
        .report-cat-btn:hover { border-color: #999 !important; background: #f8f9fb !important; }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translate(-50%, 50%) scale(0.97); }
          to   { opacity: 1; transform: translate(-50%, 50%) scale(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── 배경 오버레이 ── */}
      <div
        onClick={() => router.back()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9999,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
        }}
      >
        {/* ── 모달 본체 ── */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: "500px", height: "90vh",
            background: "white", borderRadius: "20px",
            position: "relative", display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* ────────────── 헤더 ────────────── */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "13px 18px",
            borderBottom: "1px solid #eee",
            flexShrink: 0,
          }}>
            {/* 좌측 균형용 */}
            <div style={{ width: 68 }} />

            {/* 중앙: 타이틀 */}
            <div
              style={{
                fontSize: 14, fontWeight: 700, color: "#111",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              장소 상세
            </div>

            {/* 우측: 점 세 개 + 닫기 */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

              {/* 점 세 개 메뉴 */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowMenu((v) => !v)}
                  title="더 보기"
                  style={{
                    width: 34, height: 34, border: "none",
                    background: showMenu ? "#f0f2f5" : "transparent",
                    borderRadius: 9, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.13s",
                  }}
                >
                  <MoreVertical size={18} color="#555" />
                </button>

                {/* 드롭다운 */}
                {showMenu && (
                  <>
                    <div
                      onClick={() => setShowMenu(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 50 }}
                    />
                    <div
                      style={{
                        position: "absolute", top: "calc(100% + 6px)", right: 0,
                        background: "white",
                        borderRadius: 14,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 1px 6px rgba(0,0,0,0.06)",
                        border: "1px solid rgba(0,0,0,0.07)",
                        overflow: "hidden", zIndex: 51, minWidth: 175,
                        animation: "slideUp 0.15s ease",
                      }}
                    >
                      {/* 공유하기 */}
                      <button
                        className="modal-menu-item"
                        onClick={() => { setShowMenu(false); setShowShareModal(true); }}
                        style={dropdownItemStyle}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Share2 size={13} color="#4263EB" />
                        </div>
                        <span>장소 공유하기</span>
                      </button>

                      {/* 구분선 */}
                      <div style={{ height: 1, background: "#f0f2f5", margin: "2px 12px" }} />

                      {/* 신고하기 */}
                      <button
                        className="modal-menu-item"
                        onClick={() => { setShowMenu(false); setShowReportModal(true); }}
                        style={{ ...dropdownItemStyle, color: "#ef4444" }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#fff1f1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Flag size={13} color="#ef4444" />
                        </div>
                        <span>장소 신고하기</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 닫기 버튼 */}
              <button
                onClick={() => router.back()}
                style={{
                  width: 34, height: 34, border: "none",
                  background: "transparent",
                  borderRadius: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: "#555",
                  transition: "background 0.13s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f2f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ────────────── 스크롤 콘텐츠 ────────────── */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 24px" }}>
            <PlaceDetail />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          공유 모달
      ══════════════════════════════════════════════ */}
      {showShareModal && (
        <>
          <div
            onClick={() => setShowShareModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 10100, backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "fixed", bottom: "50%", left: "50%",
              transform: "translate(-50%, 50%)",
              background: "white", borderRadius: 22,
              padding: "22px 20px", zIndex: 10101,
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              width: "min(340px, calc(100vw - 32px))",
              fontFamily: "'Noto Sans KR', sans-serif",
              animation: "modalFadeIn 0.2s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>장소 공유하기</div>
              <button onClick={() => setShowShareModal(false)} style={{ border: "none", background: "#f0f2f5", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="#666" />
              </button>
            </div>

            {/* 링크 복사 */}
            <div
              className="share-row"
              onClick={handleCopyLink}
              style={shareRowStyle}
            >
              <div style={shareIconBox("#f0f2f5")}>
                <Link size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>링크 복사하기</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>클립보드에 링크를 복사합니다</div>
              </div>
            </div>

            {/* SNS 공유 */}
            <div
              className="share-row"
              onClick={handleSnsShare}
              style={shareRowStyle}
            >
              <div style={shareIconBox("#f0f2f5")}>
                <Upload size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>SNS로 공유하기</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>인스타그램, X, Thread 등으로 공유합니다</div>
              </div>
            </div>

            {/* 카카오톡 */}
            <div
              className="share-row"
              onClick={() => { handleKakaoShare(); setShowShareModal(false); }}
              style={{ ...shareRowStyle, background: "#FEE500", borderColor: "#f5dc00" }}
            >
              <div style={shareIconBox("rgba(0,0,0,0.08)")}>
                <KakaoIcon size={16} color="#7a5f00" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#5a4500" }}>카카오톡으로 공유하기</div>
                <div style={{ fontSize: 11, color: "#7a6200", marginTop: 2 }}>카카오톡 친구에게 공유합니다</div>
              </div>
            </div>

            <button
              onClick={() => setShowShareModal(false)}
              style={{ marginTop: 14, width: "100%", padding: "11px", background: "#f5f5f5", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'Noto Sans KR', sans-serif", color: "#555" }}
            >
              닫기
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          장소 신고 모달
      ══════════════════════════════════════════════ */}
      {showReportModal && (
        <>
          <div
            onClick={closeReport}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10100, backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "white", borderRadius: 22,
              zIndex: 10101,
              boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              width: "min(420px, calc(100vw - 32px))",
              maxHeight: "88vh", overflowY: "auto",
              fontFamily: "'Noto Sans KR', sans-serif",
              animation: "modalFadeIn 0.2s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{
              position: "sticky", top: 0, background: "white",
              padding: "18px 20px 14px",
              borderBottom: "1px solid #f0f2f5",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              zIndex: 1, borderRadius: "22px 22px 0 0",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "#fff1f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Flag size={15} color="#ef4444" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>장소 신고하기</div>
              </div>
              <button onClick={closeReport} style={{ border: "none", background: "#f0f2f5", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} color="#666" />
              </button>
            </div>

            <div style={{ padding: "18px 20px 24px" }}>

              {/* 안내 배너 */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 9,
                padding: "11px 13px", background: "#fffbeb",
                borderRadius: 11, border: "1px solid #fde68a",
                marginBottom: 18,
              }}>
                <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.7 }}>
                  잘못된 장소 정보나 문제가 있는 장소를 신고해주시면<br />
                  검토 후 빠르게 처리하겠습니다.
                </div>
              </div>

              {/* 신고 사유 선택 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 10 }}>
                  신고 사유를 선택해주세요 <span style={{ color: "#ef4444" }}>*</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {PLACE_REPORT_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        className="report-cat-btn"
                        onClick={() => setReportCategory(cat.value)}
                        style={{
                          width: "100%", padding: "11px 13px",
                          borderRadius: 11, cursor: "pointer",
                          border: `1.5px solid ${reportCategory === cat.value ? "#111" : "#e2e4e8"}`,
                          background: reportCategory === cat.value ? "#111" : "white",
                          color: reportCategory === cat.value ? "white" : "#333",
                          textAlign: "left", fontSize: 13, fontWeight: reportCategory === cat.value ? 700 : 500,
                          fontFamily: "'Noto Sans KR', sans-serif",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          transition: "all 0.14s ease",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Icon size={14} color={reportCategory === cat.value ? "white" : "#666"} />
                          {cat.label}
                        </span>
                        {reportCategory === cat.value && (
                          <span style={{ fontSize: 14, flexShrink: 0 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 구체적인 사유 입력 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 8 }}>
                  구체적인 사유를 작성해주세요 <span style={{ color: "#ef4444" }}>*</span>
                </div>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder={
                    reportCategory === "wrong_info"
                      ? "어떤 정보가 잘못되었는지 알려주세요 (예: 영업시간이 다릅니다, 주소가 틀렸습니다 등)"
                      : reportCategory === "different"
                      ? "실제 방문했을 때 어떤 점이 달랐는지 알려주세요"
                      : "신고 사유를 자세히 입력해주세요."
                  }
                  maxLength={500}
                  style={{
                    width: "100%", minHeight: 110, padding: "11px 13px",
                    borderRadius: 11, border: "1.5px solid #e2e4e8",
                    fontSize: 13, resize: "vertical",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    outline: "none", lineHeight: 1.7, color: "#333",
                    boxSizing: "border-box",
                    transition: "border-color 0.14s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#555")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e4e8")}
                />
                <div style={{ textAlign: "right", fontSize: 11, color: "#bbb", marginTop: 5 }}>
                  {reportReason.length} / 500
                </div>
              </div>

              {/* 버튼 */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={closeReport}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 11,
                    border: "1px solid #e2e4e8", background: "white",
                    color: "#555", fontWeight: 700, fontSize: 13,
                    cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleReportSubmit}
                  disabled={!reportCategory || !reportReason.trim() || isSubmitting}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 11, border: "none",
                    background: (!reportCategory || !reportReason.trim() || isSubmitting)
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #ef4444, #dc2626)",
                    color: "white", fontWeight: 700, fontSize: 13,
                    cursor: (!reportCategory || !reportReason.trim() || isSubmitting) ? "default" : "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    boxShadow: (!reportCategory || !reportReason.trim() || isSubmitting)
                      ? "none"
                      : "0 2px 8px rgba(239,68,68,0.30)",
                    transition: "all 0.14s ease",
                  }}
                >
                  {isSubmitting ? "신고 접수 중..." : "신고하기"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── 스타일 상수 ─────────────────────────────────── */
const dropdownItemStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "none",
  background: "white", cursor: "pointer", textAlign: "left",
  fontSize: 13, fontWeight: 600, color: "#222",
  fontFamily: "'Noto Sans KR', sans-serif",
  display: "flex", alignItems: "center", gap: 10,
};

const shareRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  padding: "13px", borderRadius: 13, cursor: "pointer",
  marginBottom: 7, border: "1px solid #eee",
  background: "white",
};

const shareIconBox = (bg: string): React.CSSProperties => ({
  width: 34, height: 34, borderRadius: 9,
  background: bg, display: "flex",
  alignItems: "center", justifyContent: "center",
  flexShrink: 0,
});