"use client";

// 첫 접속 안내 팝업 — 지금은 데모(시범 운영) 버전이라는 점과, 의견·제보·신고를 부탁드리는 안내.
// "오늘 하루 보지 않기"를 누르면 그날은 다시 뜨지 않고, "확인"만 누르면 다음 접속 때 다시 보입니다.
// 정식 출시 때는 KakaoMap에서 이 컴포넌트를 빼기만 하면 됩니다.

import { useState } from "react";
import { X, Mail, Copy, Check, MessageSquareHeart, MapPinPlus, Flag, Monitor } from "lucide-react";

const CONTACT_EMAIL = "infoker12@naver.com";
const STORAGE_KEY = "ggk_demo_notice_hidden_on";

/** 한국 시간 기준 오늘 날짜(YYYY-MM-DD) */
const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** 오늘 "하루 보지 않기"를 누르지 않았으면 true */
export function shouldShowDemoNotice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== todayKst();
  } catch {
    return true; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 그냥 보여줍니다
  }
}

const ITEMS = [
  {
    Icon: MessageSquareHeart, color: "#B4532A", bg: "#FDEBDD",
    title: "의견을 들려주세요",
    lines: ["불편했던 점, 추가되면 좋겠는 기능을", "아래 메일로 편하게 보내 주세요."],
  },
  {
    Icon: MapPinPlus, color: "#3F5230", bg: "#DCE7CD",
    title: "장소 정보는 채워 가는 중이에요",
    lines: ["아직 비어 있는 정보가 많아요.", "알고 계신 장소는 '제보하기'로 알려 주세요."],
  },
  {
    Icon: Flag, color: "#B42318", bg: "#FDE3E1",
    title: "\"가 봤는데 안 되던데?\"",
    lines: ["그런 장소는 미리 신고해 주세요.", "장소 상세의 ⋮ 메뉴 → '장소 신고하기'", "직접 확인한 뒤 바로 삭제할게요."],
  },
];

export default function DemoNoticeModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 복사가 막힌 환경 — 주소는 화면에 그대로 보입니다 */ }
  };

  const hideToday = () => {
    try { localStorage.setItem(STORAGE_KEY, todayKst()); } catch { /* 저장 실패는 무시 */ }
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="데모 버전 안내"
        className="ggk-body"
        style={{
          position: "fixed", zIndex: 2001, left: "50%", top: "50%", translate: "-50% -50%",
          width: "min(420px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 48px)",
          display: "flex", flexDirection: "column", wordBreak: "keep-all",
          background: "white", borderRadius: "20px", overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
        }}
      >
        {/* 머리말 */}
        <div style={{ position: "relative", padding: "22px 22px 16px", background: "linear-gradient(135deg,#F3EFE2,#E4EBDC)" }}>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={15} color="#555" />
          </button>
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, background: "#5C7A4A", color: "white", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.3px" }}>
            DEMO · 시범 운영 중
          </span>
          <div className="ggk-logo" style={{ marginTop: 9, fontSize: 19, fontWeight: 800, color: "#2f3a26", lineHeight: 1.35 }}>
            같이가개에 오신 걸 환영해요
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#55604a", lineHeight: 1.65 }}>
            지금은 <b>데모 버전</b>이에요.<br />
            더 좋은 서비스를 위해 의견을 모으고 있어요.
          </div>
          {/* 가장 먼저 알려야 하는 내용 — PC 화면 기준으로 만들어져 있음 */}
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#FFF6DB", border: "1px solid #F1D98A", display: "flex", gap: 9, alignItems: "flex-start" }}>
            <Monitor size={17} color="#9A6B00" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: "#6B4A00", lineHeight: 1.6 }}>
              <b>지금은 PC(웹) 화면 기준이에요.</b><br />
              휴대폰에서는 일부 화면이 보기 불편할 수 있어요.
            </div>
          </div>
        </div>

        {/* 안내 항목 */}
        <div style={{ padding: "16px 22px 6px", overflowY: "auto" }}>
          {ITEMS.map(({ Icon, color, bg, title, lines }) => (
            <div key={title} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={17} color={color} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1f1f1f", lineHeight: 1.4 }}>{title}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#666", lineHeight: 1.65 }}>
                  {lines.map((line) => <div key={line}>{line}</div>)}
                </div>
              </div>
            </div>
          ))}

          {/* 메일 주소 */}
          <div style={{ marginTop: 2, padding: "11px 12px", borderRadius: 12, background: "#F7F7F5", border: "1px solid #ECECE8", display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={15} color="#5C7A4A" style={{ flexShrink: 0 }} />
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[같이가개] 의견 보내기")}`} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#2f3a26", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {CONTACT_EMAIL}
            </a>
            <button
              onClick={copyEmail}
              style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "1px solid #dcdcd6", background: "white", fontSize: 11.5, fontWeight: 700, color: copied ? "#2F7D46" : "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
            </button>
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 8, padding: "14px 22px 20px" }}>
          <button
            onClick={hideToday}
            style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #e2e2dc", background: "white", fontSize: 12.5, fontWeight: 700, color: "#777", cursor: "pointer" }}
          >
            오늘 하루 보지 않기
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "#5C7A4A", fontSize: 13, fontWeight: 700, color: "white", cursor: "pointer" }}
          >
            확인
          </button>
        </div>
      </div>
    </>
  );
}
