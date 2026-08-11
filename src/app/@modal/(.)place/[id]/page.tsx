"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  MoreVertical, Link, Upload, MessageCircle as KakaoIcon,
  X, Flag, Share2, AlertTriangle, ChevronDown,
  DoorOpen, PawPrint, Store, Info, ThumbsDown,
  Copy, AlertOctagon, MessageSquare, Trash2, ImageOff,
  RotateCw, MapPinPlus,
} from "lucide-react";
import PlaceDetail from "@/app/place/[id]/page";
import { supabase } from "@/lib/supabase";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";

/* ── 장소 신고 사유 목록 ─────────────────────────────── */
const PLACE_REPORT_CATEGORIES = [
  { value: "closed",        label: "폐업했어요",                                          icon: DoorOpen      },
  { value: "no_pets",       label: "반려동물 동반이 불가능해졌어요",                         icon: PawPrint      },
  { value: "changed",       label: "업종이 변경되었어요",                                   icon: Store         },
  { value: "wrong_info",    label: "가게 정보(영업시간, 주소 등)가 잘못되었어요",              icon: Info          },
  { value: "different",     label: "실제 방문 시 정보와 달라요",                             icon: ThumbsDown    },
  { value: "wrong_image",   label: "등록된 이미지가 실제 장소와 다르거나 잘못됐어요",          icon: ImageOff      },
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
  const [placeAddress, setPlaceAddress] = useState<string>("");
  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("places")
        .select("name, address")
        .eq("id", placeId)
        .single();
      if (cancelled) return;
      if (data?.name) {
        setPlaceName(data.name);
        setPlaceAddress(data.address || "");
        return;
      }
      // ⚠ 관광공사·문화정보원·식품안전나라 공공데이터 출처 장소는 `places` 테이블에
      // 실제 행이 없는 합성 ID라 위 조회가 항상 비어있습니다. place/[id]/page.tsx가
      // 하는 것과 동일하게 공공데이터 쪽에서 한 번 더 찾습니다 — 이게 없으면 신고
      // 시 장소명이 빈 값(관리자 화면엔 "—")으로 저장됩니다.
      const publicDataPlaces = await fetchPublicDataPlaces();
      if (cancelled) return;
      const found = publicDataPlaces.find((p) => String(p.id) === String(placeId));
      if (found) {
        setPlaceName(found.name || "");
        setPlaceAddress(found.address || "");
      }
    })();
    return () => { cancelled = true; };
  }, [placeId]);

  /* 메뉴 & 모달 상태 */
  const [showMenu,        setShowMenu]        = useState(false);
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showTipModal,    setShowTipModal]    = useState(false);

  // ⚠ "로딩중..."이 오래 떠 있을 때 전체 페이지(지도까지)를 새로고침하지 않고
  // 이 모달 안의 PlaceDetail만 다시 불러올 방법이 없었습니다. PlaceDetail의 key를
  // 바꾸면 React가 기존 인스턴스를 버리고 완전히 새로 마운트해서, 그 안의 데이터
  // fetch용 useEffect들이 전부 처음부터 다시 실행됩니다 — 지도/모달 바깥은 그대로
  // 유지한 채 이 모달 콘텐츠만 새로고침되는 효과입니다.
  const [refreshKey, setRefreshKey] = useState(0);

  /* ── 관리자 삭제 메뉴 — PlaceDetail 내부 상태를 이 헤더의 기존 점세개 버튼으로
     끌어올립니다(중복 버튼 방지). deletePlace 함수는 매 렌더마다 새로 만들어지므로
     ref에 담아 최신 함수만 갖고 있고, 리렌더를 유발하는 건 원시값(불리언) state뿐입니다. */
  const [placeIsAdmin,   setPlaceIsAdmin]   = useState(false);
  const [placeCanDelete, setPlaceCanDelete] = useState(false);
  const [placeIsPublicData, setPlaceIsPublicData] = useState(false);
  const [placeWillActuallyDelete, setPlaceWillActuallyDelete] = useState(true);
  const [placeDeleting,  setPlaceDeleting]  = useState(false);
  const deletePlaceRef = useRef<() => void>(() => {});
  const handleAdminMenu = useCallback(
    (menu: { isAdmin: boolean; canDelete: boolean; isPublicData: boolean; willActuallyDelete: boolean; deleting: boolean; deletePlace: () => void }) => {
      setPlaceIsAdmin(menu.isAdmin);
      setPlaceCanDelete(menu.canDelete);
      setPlaceIsPublicData(menu.isPublicData);
      setPlaceWillActuallyDelete(menu.willActuallyDelete);
      setPlaceDeleting(menu.deleting);
      deletePlaceRef.current = menu.deletePlace;
    },
    []
  );

  /* 신고 폼 */
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason,   setReportReason]   = useState("");
  const [isSubmitting,   setIsSubmitting]   = useState(false);

  /* 제보(정보 추가) 폼 — 신고와 달리 "문제"가 아니라 빠진 정보를 채워달라는
     제안이라 필드별 입력 폼입니다. 전부 선택 입력이며, 최소 1개는 채워야 제출 가능. */
  const [tipHours,      setTipHours]      = useState("");
  const [tipLargeDog,   setTipLargeDog]   = useState<"" | "yes" | "no">("");
  const [tipPhone,      setTipPhone]      = useState("");
  const [tipWebsite,    setTipWebsite]    = useState("");
  const [tipClosedDays, setTipClosedDays] = useState("");
  const [tipParking,    setTipParking]    = useState("");
  const [tipEntryFee,   setTipEntryFee]   = useState("");
  const [tipMemo,       setTipMemo]       = useState("");
  const [isTipSubmitting, setIsTipSubmitting] = useState(false);

  const tipHasAnyValue =
    tipHours.trim() || tipLargeDog || tipPhone.trim() ||
    tipWebsite.trim() || tipClosedDays.trim() || tipParking.trim() ||
    tipEntryFee.trim() || tipMemo.trim();

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
    const Kakao = (window as any).Kakao;
    if (!Kakao) {
      alert("카카오톡 공유를 사용할 수 없습니다.");
      return;
    }
    // ⚠ 카카오 SDK 스크립트를 afterInteractive로 늦춰 불렀기 때문에(최적화), 초기
    // 로드 이펙트의 Kakao.init() 호출이 스크립트 로딩보다 먼저 실행돼 건너뛰어졌을
    // 수 있습니다 — 공유 시점에 아직 초기화 전이면 여기서 한 번 더 안전하게 시도합니다.
    if (!Kakao.isInitialized()) Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
    Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: placeName ? `${placeName} - 같이가개` : "같이가개",  // ← 변경
        description: placeName
          ? `${placeName} 반려동물과 함께 가볼 수 있는 장소예요! 같이가개에서 확인해보세요.`
          : "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",  // ← 변경
        imageUrl: `${window.location.origin}/icons/header_logo_final.png`,
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

            // ⚠ 관리자 페이지가 매번 places 테이블을 다시 조회해 이름을 맞추면,
            // 공공데이터 출처(합성 ID) 장소는 항상 "—"로 보였습니다. 지금 화면에
            // 이미 떠 있는 이름/주소를 그대로 같이 저장해둡니다.
            place_name: placeName || null,
            place_address: placeAddress || null,

            reporter_key: userKey,

            // ★ 추가
            nickname: nickname,

            report_category: reportCategory,
            report_reason: reportReason.trim(),
          },
        ])
        .select();

      if (error) {
        // ⚠ 예전엔 콘솔에만 에러를 찍고 화면엔 아무 반응이 없어서(버튼 눌러도
        // 조용히 실패), 사용자는 신고가 됐는지 안 됐는지 알 수가 없었습니다.
        // 리뷰/이미지 업로드 실패 때처럼 실제 에러 메시지를 그대로 알려줍니다.
        // (공공데이터 출처 장소 신고가 실패한다면 scripts/sql/fix-reports-place-id.sql
        // 을 Supabase에서 실행해야 할 가능성이 큽니다 — place_images 때와 같은 원인입니다.)
        console.error("장소 신고 오류:", error.message, error.details, error.hint, error.code);
        alert("신고 접수에 실패했습니다: " + (error.message || "알 수 없는 오류"));
        return;
      }

      alert("장소 신고가 정상적으로 접수되었습니다.\n검토 후 처리하겠습니다.");

      setShowReportModal(false);
      setReportCategory("");
      setReportReason("");

    } catch (err: any) {
      console.error("장소 신고 예외:", err);
      alert("신고 접수 중 오류가 발생했습니다: " + (err?.message || "알 수 없는 오류"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeReport = () => {
    setShowReportModal(false);
    setReportCategory("");
    setReportReason("");
  };

  /* ── 제보(정보 추가) 핸들러 ── */
  const resetTipForm = () => {
    setTipHours(""); setTipLargeDog(""); setTipPhone("");
    setTipWebsite(""); setTipClosedDays(""); setTipParking(""); setTipEntryFee("");
    setTipMemo("");
  };

  const closeTip = () => {
    setShowTipModal(false);
    resetTipForm();
  };

  const handleTipSubmit = async () => {
    if (!tipHasAnyValue || !placeId) return;

    setIsTipSubmitting(true);

    try {
      const userKey = getUserKey();
      const { data: sessionData } = await supabase.auth.getSession();

      const { error } = await supabase
        .from("proposals")
        .insert([
          {
            proposal_kind: "info_update",
            place_id: Number(placeId),
            place_name: placeName || null,
            address: placeAddress || null,

            hours: tipHours.trim() || null,
            large_dog: tipLargeDog ? tipLargeDog === "yes" : null,
            phone: tipPhone.trim() || null,
            website: tipWebsite.trim() || null,
            closed_days: tipClosedDays.trim() || null,
            parking: tipParking.trim() || null,
            entry_fee: tipEntryFee.trim() || null,
            memo: tipMemo.trim() || null,

            reporter_key: userKey,
            auth_user_id: sessionData.session?.user?.id || null,
            status: "pending",
            is_resolved: false,
          },
        ]);

      if (error) {
        console.error("장소 제보 오류:", error.message, error.details, error.hint, error.code);
        alert("제보 접수에 실패했습니다: " + (error.message || "알 수 없는 오류"));
        return;
      }

      alert("제보가 정상적으로 접수되었습니다.\n검토 후 반영하겠습니다.");
      closeTip();

    } catch (err: any) {
      console.error("장소 제보 예외:", err);
      alert("제보 접수 중 오류가 발생했습니다: " + (err?.message || "알 수 없는 오류"));
    } finally {
      setIsTipSubmitting(false);
    }
  };

  /* ── JSX ── */
  return (
    <>
      <style>{`
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

                      {/* 정보 제보하기 — 빠진/틀린 정보를 채워달라는 제안 (신고와 달리 "문제"가
                          아니라 "추가 정보 제공"이 목적이라 별도 버튼으로 분리) */}
                      <button
                        className="modal-menu-item"
                        onClick={() => { setShowMenu(false); setShowTipModal(true); }}
                        style={dropdownItemStyle}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#eef6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <MapPinPlus size={13} color="#2563eb" />
                        </div>
                        <span>장소 제보하기</span>
                      </button>

                      {/* 관리자 전용 — 장소 자체 삭제. 일반 회원에게는 보이지 않습니다. */}
                      {placeIsAdmin && placeCanDelete && (
                        <>
                          <div style={{ height: 1, background: "#f0f2f5", margin: "2px 12px" }} />
                          <button
                            className="modal-menu-item"
                            disabled={placeDeleting}
                            onClick={() => { setShowMenu(false); deletePlaceRef.current(); }}
                            style={{ ...dropdownItemStyle, color: "#ef4444" }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#fff1f1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Trash2 size={13} color="#ef4444" />
                            </div>
                            <span>{placeDeleting ? "처리 중..." : placeWillActuallyDelete ? "장소 삭제하기 (관리자)" : "장소 숨기기 (관리자)"}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 새로고침 버튼 — 이 모달(PlaceDetail)만 다시 마운트해서 데이터를 새로
                  불러옵니다. 전체 페이지 새로고침(F5)과 달리 지도 상태는 그대로 유지됩니다. */}
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                title="새로고침"
                style={{
                  width: 34, height: 34, border: "none",
                  background: "transparent",
                  borderRadius: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.13s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f2f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <RotateCw size={16} color="#555" />
              </button>

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
            <PlaceDetail key={refreshKey} onAdminMenu={handleAdminMenu} />
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

      {/* ── 제보(정보 추가) 모달 ── */}
      {showTipModal && (
        <>
          <div
            onClick={closeTip}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10100, backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "white", borderRadius: 22,
              zIndex: 10101,
              boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              width: "min(440px, calc(100vw - 32px))",
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
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "#eef6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPinPlus size={15} color="#2563eb" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>장소 제보하기</div>
              </div>
              <button onClick={closeTip} style={{ border: "none", background: "#f0f2f5", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} color="#666" />
              </button>
            </div>

            <div style={{ padding: "18px 20px 24px" }}>

              {/* 안내 배너 */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 9,
                padding: "11px 13px", background: "#eff6ff",
                borderRadius: 11, border: "1px solid #bfdbfe",
                marginBottom: 18,
              }}>
                <Info size={14} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, color: "#1e3a8a", lineHeight: 1.7 }}>
                  이 장소에 빠져있거나 잘못된 정보를 알려주세요.<br />
                  아는 항목만 채워 제출하시면 검토 후 반영됩니다.
                </div>
              </div>

              {/* 입력 필드들 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 13, marginBottom: 20 }}>
                <TipField label="영업시간" value={tipHours} onChange={setTipHours} placeholder="예: 매일 10:00 - 21:00" />

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 7 }}>대형견 동반 가능 여부</div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {([["yes", "가능"], ["no", "불가능"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setTipLargeDog(tipLargeDog === val ? "" : val)}
                        style={{
                          flex: 1, padding: "9px", borderRadius: 10,
                          border: `1.5px solid ${tipLargeDog === val ? "#111" : "#e2e4e8"}`,
                          background: tipLargeDog === val ? "#111" : "white",
                          color: tipLargeDog === val ? "white" : "#555",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          fontFamily: "'Noto Sans KR', sans-serif",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <TipField label="전화번호" value={tipPhone} onChange={setTipPhone} placeholder="예: 051-123-4567" />
                <TipField label="홈페이지" value={tipWebsite} onChange={setTipWebsite} placeholder="예: https://..." />
                <TipField label="휴무일" value={tipClosedDays} onChange={setTipClosedDays} placeholder="예: 매주 월요일" />
                <TipField label="주차" value={tipParking} onChange={setTipParking} placeholder="예: 건물 내 주차장 이용 가능" />
                <TipField label="입장료" value={tipEntryFee} onChange={setTipEntryFee} placeholder="예: 무료 / 1인 5,000원" />

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 7 }}>기타 메모</div>
                  <textarea
                    value={tipMemo}
                    onChange={(e) => setTipMemo(e.target.value)}
                    placeholder="그 밖에 알려주고 싶은 정보를 자유롭게 적어주세요"
                    maxLength={300}
                    style={{
                      width: "100%", minHeight: 70, padding: "10px 12px",
                      borderRadius: 11, border: "1.5px solid #e2e4e8",
                      fontSize: 13, resize: "vertical",
                      fontFamily: "'Noto Sans KR', sans-serif",
                      outline: "none", lineHeight: 1.7, color: "#333",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* 버튼 */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={closeTip}
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
                  onClick={handleTipSubmit}
                  disabled={!tipHasAnyValue || isTipSubmitting}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 11, border: "none",
                    background: (!tipHasAnyValue || isTipSubmitting)
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #3b82f6, #2563eb)",
                    color: "white", fontWeight: 700, fontSize: 13,
                    cursor: (!tipHasAnyValue || isTipSubmitting) ? "default" : "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    boxShadow: (!tipHasAnyValue || isTipSubmitting)
                      ? "none"
                      : "0 2px 8px rgba(37,99,235,0.30)",
                    transition: "all 0.14s ease",
                  }}
                >
                  {isTipSubmitting ? "제보 접수 중..." : "제보하기"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* 제보 폼의 한 줄짜리 텍스트 입력 필드 (라벨 + input) */
function TipField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 7 }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "10px 12px",
          borderRadius: 11, border: "1.5px solid #e2e4e8",
          fontSize: 13, fontFamily: "'Noto Sans KR', sans-serif",
          outline: "none", color: "#333",
          boxSizing: "border-box",
        }}
      />
    </div>
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