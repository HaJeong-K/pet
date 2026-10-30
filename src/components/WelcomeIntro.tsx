"use client";

// 첫 방문 소개 — 맨 앞 장에서 "지금은 데모 버전"임을 알리고, 이어서 어떤 서비스인지 네 장으로 알려 줍니다.
// (예전의 "데모 버전 안내" 팝업을 대신합니다. 그 팝업은 'PC 화면 기준이라 휴대폰은 불편할 수 있다'처럼
//  이제는 맞지 않는 내용이 있었고, 서비스가 무엇을 해 주는지는 알려 주지 않았습니다.)
//
// 언제 뜨나
//  · 앱(사이트)을 새로 열 때마다 한 번 뜹니다. 같은 방문 안에서 다른 탭에 갔다 돌아올 때는 다시 뜨지 않습니다.
//  · "다시 보지 않기"를 누르면 이 기기에서는 더 뜨지 않습니다.
// 각 장은 "그림 → 제목 두 줄 → 설명 한두 줄"의 같은 틀이라, 넘겨도 글자 위치가 흔들리지 않습니다.

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Flag, MapPinPlus, MessageSquareHeart, Search, X } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";

const CONTACT_EMAIL = "infoker12@naver.com";
/** "다시 보지 않기"를 눌렀는지(기기에 계속 남음). 소개 내용을 크게 바꾸면 끝의 숫자를 올립니다. */
const NEVER_KEY = "ggk_intro_never_v2";
/** 이번 방문에서 이미 봤는지(앱·탭을 닫으면 지워짐) */
const SESSION_KEY = "ggk_intro_seen";

/** 소개를 띄워야 하면 true */
export function shouldShowWelcomeIntro(): boolean {
  try {
    if (localStorage.getItem(NEVER_KEY)) return false;
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return true; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 그냥 보여 줍니다
  }
}

const GREEN = "#5C7A4A", BROWN = "#8B5E3C", CREAM = "#F7F3E8", INK = "#2F2A24";

// ── 장마다의 그림(화면 일부를 흉내 낸 작은 그림 — 실제 화면에서 보게 될 모습 그대로) ──

function DemoArt() {
  const rows = [
    { Icon: MessageSquareHeart, color: "#B4532A", bg: "#FDEBDD", title: "의견을 들려주세요", sub: "불편한 점·바라는 기능을 메일로" },
    { Icon: MapPinPlus, color: "#3F5230", bg: "#DCE7CD", title: "장소 정보는 채워 가는 중", sub: "아는 곳은 ‘제보하기’로" },
    { Icon: Flag, color: "#B42318", bg: "#FDE3E1", title: "“가 봤는데 안 되던데?”", sub: "장소 상세 ⋮ 메뉴 → 신고하기" },
  ];
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "linear-gradient(135deg,#F3EFE2,#E4EBDC)", padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 9 }}>
      <span style={{ alignSelf: "flex-start", padding: "3px 9px", borderRadius: 999, background: GREEN, color: "white", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.3px" }}>DEMO · 시범 운영 중</span>
      {rows.map(({ Icon, color, bg, title, sub }) => (
        <div key={title} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={16} color={color} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>{title}</div>
            <div style={{ fontSize: 11, color: "#6b665c", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MapArt() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/default-place.png" alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {[
        { left: "9%", top: "20%", label: "🏠 실내 동반 카페" },
        { left: "58%", top: "14%", label: "🌿 야외 테라스" },
        { left: "60%", top: "68%", label: "💊 동물약국" },
        { left: "8%", top: "70%", label: "🌳 공원" },
      ].map((pill) => (
        <span key={pill.label} style={{ position: "absolute", left: pill.left, top: pill.top, padding: "5px 10px", borderRadius: 999, background: "white", fontSize: 11, fontWeight: 700, color: INK, boxShadow: "0 2px 6px rgba(0,0,0,0.14)", whiteSpace: "nowrap" }}>
          {pill.label}
        </span>
      ))}
    </div>
  );
}

function SearchArt() {
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#EEF3E8", padding: "18px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderRadius: 999, background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        <Search size={15} color="#9aa39a" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>우리동네 핫플</span>
        <span style={{ width: 1.5, height: 15, background: GREEN, marginLeft: -4 }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["내주변 카페", "대구 삼덕동 동물병원", "우리동네 새장소", "성수 대형견 식당"].map((text) => (
          <span key={text} style={{ padding: "6px 10px", borderRadius: 999, background: "white", border: "1px solid #DCE5D3", fontSize: 11.5, fontWeight: 600, color: "#48603A", whiteSpace: "nowrap" }}>{text}</span>
        ))}
      </div>
    </div>
  );
}

function PickArt() {
  const stop = (n: number, name: string, sub: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: GREEN, color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 10.5, color: "#5f5f56" }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#FBF3E4", padding: "14px 16px", display: "flex", gap: 12, alignItems: "stretch" }}>
      <div style={{ flex: 1.25, minWidth: 0, background: "white", borderRadius: 14, padding: "12px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 9, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: GREEN }}>AI 산책 코스 · 1.7km</div>
        {stop(1, "동네 공원", "산책 · 도보 6분")}
        {stop(2, "테라스 카페", "쉬어 가기")}
        {stop(3, "동반 식당", "저녁")}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ flex: 1, background: "white", borderRadius: 14, padding: "10px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10.5, color: "#5f5f56", fontWeight: 600 }}>반려동물 친화도</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BROWN, lineHeight: 1.2 }}>87<span style={{ fontSize: 12 }}>점</span></div>
        </div>
        <div style={{ flex: 1, background: "white", borderRadius: 14, padding: "10px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10.5, color: "#5f5f56", fontWeight: 600 }}>다녀온 보호자 후기</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.4 }}>&ldquo;대형견도 편했어요&rdquo;</div>
        </div>
      </div>
    </div>
  );
}

function TogetherArt() {
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#EFEAF6", padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["장소 제보 +50", "정보 추가 +20", "장소 사진 +5", "후기 +10"].map((text) => (
          <span key={text} style={{ padding: "5px 9px", borderRadius: 999, background: "white", fontSize: 11, fontWeight: 700, color: "#5b4a78", whiteSpace: "nowrap" }}>{text}</span>
        ))}
      </div>
      <div style={{ height: 1, background: "rgba(0,0,0,0.07)" }} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {[1, 2, 3, 4, 5, 6].map((level) => <LevelBadge key={level} level={level} />)}
      </div>
    </div>
  );
}

const SLIDES = [
  // 맨 앞 장: 지금은 데모(시범 운영) 버전이라는 안내
  { Art: DemoArt, title: ["같이가개는 지금,", "데모(시범 운영) 버전이에요"], text: "더 좋은 서비스를 위해 의견을 모으고 있어요. 불편한 점은 편하게 알려 주세요." },
  { Art: MapArt, title: ["같이 갈 수 있는 곳,", "지도에서 한눈에"], text: "카페·식당·여행지·병원·공원까지, 전국 3만여 곳의 반려동물 동반 정보를 모았어요." },
  { Art: SearchArt, title: ["찾고 싶은 대로,", "말하듯이 검색해요"], text: "가게 이름이나 지역은 물론, ‘우리동네 핫플’처럼 써도 알아들어요." },
  { Art: PickArt, title: ["오늘 어디 갈지,", "같이 골라 드려요"], text: "AI 산책 코스와 맞춤 추천, 친화도 점수와 다녀온 보호자의 후기로 정해 보세요." },
  { Art: TogetherArt, title: ["보호자들이", "함께 채우는 지도예요"], text: "제보·후기·사진을 남기면 레벨이 올라가요. 달라진 정보는 신고로 알려 주세요." },
];

export default function WelcomeIntro({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const touchX = useRef<number | null>(null);
  const last = index === SLIDES.length - 1;
  // 의견 메일 줄은 데모 안내(첫 장)와 마지막 장에서 보입니다.
  const showContact = index === 0 || last;

  const close = (never: boolean) => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (never) localStorage.setItem(NEVER_KEY, "1");
    } catch { /* 저장 실패는 무시 */ }
    onClose();
  };
  const go = (next: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));

  // 키보드: 좌우 화살표로 넘기고 Esc로 닫습니다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(SLIDES.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 복사가 막힌 환경 — 주소는 화면에 그대로 보입니다 */ }
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="같이가개 소개"
        data-welcome-intro
        className="ggk-body"
        style={{
          position: "fixed", zIndex: 2001, left: "50%", top: "50%", translate: "-50% -50%",
          width: "min(400px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 40px)",
          display: "flex", flexDirection: "column", wordBreak: "keep-all",
          background: CREAM, borderRadius: 24, overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* 머리: 로고 · 닫기 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 6px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo_lockup.png" alt="같이가개" style={{ height: 30, width: "auto", display: "block" }} />
          <button onClick={() => close(false)} aria-label="닫기" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.07)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} color="#555" />
          </button>
        </div>

        {/* 본문: 옆으로 넘기는 네 장 */}
        <div
          style={{ overflow: "hidden", flex: "1 1 auto", minHeight: 0 }}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const moved = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(moved) > 40) go(index + (moved < 0 ? 1 : -1));
          }}
        >
          <div style={{ display: "flex", transform: `translateX(-${index * 100}%)`, transition: "transform 0.28s ease" }}>
            {SLIDES.map(({ Art, title, text }, i) => (
              <div key={title[0]} aria-hidden={i !== index} style={{ flex: "0 0 100%", minWidth: 0, padding: "8px 18px 0", boxSizing: "border-box" }}>
                <div style={{ height: 176 }}><Art /></div>
                <div className="ggk-logo" style={{ marginTop: 16, fontSize: 21, fontWeight: 800, color: INK, lineHeight: 1.32 }}>
                  {title[0]}<br /><span style={{ color: GREEN }}>{title[1]}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13.5, color: "#5d574e", lineHeight: 1.65, minHeight: 45 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 시범 운영 안내 — 마지막 장에서만 보입니다(자리는 늘 같아서 높이가 흔들리지 않습니다) */}
        <div style={{ margin: "10px 18px 0", height: 40, visibility: showContact ? "visible" : "hidden" }}>
          <div style={{ height: "100%", padding: "0 12px", borderRadius: 12, background: "white", border: "1px solid #ECE6D6", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flexShrink: 0, padding: "3px 7px", borderRadius: 999, background: "#5C7A4A", color: "white", fontSize: 10, fontWeight: 800 }}>시범 운영 중</span>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[같이가개] 의견 보내기")}`} style={{ flex: 1, minWidth: 0, fontSize: 11.5, letterSpacing: "-0.2px", color: INK, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{CONTACT_EMAIL}</a>
            <button onClick={copyEmail} tabIndex={showContact ? 0 : -1} style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 8, border: "1px solid #dcd6c6", background: "white", fontSize: 11, fontWeight: 700, color: copied ? "#2F7D46" : "#555", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {copied ? <><Check size={11} />복사됨</> : <><Copy size={11} />복사</>}
            </button>
          </div>
        </div>

        {/* 점 · 버튼 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "12px 0 4px" }}>
          {SLIDES.map((slide, i) => (
            <button key={slide.title[0]} onClick={() => go(i)} aria-label={`${i + 1}번째 소개`} aria-current={i === index}
              style={{ width: i === index ? 20 : 7, height: 7, borderRadius: 999, border: "none", padding: 0, background: i === index ? GREEN : "#D9D2C0", cursor: "pointer", transition: "width 0.2s" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 18px" }}>
          <button onClick={() => close(true)} style={{ padding: "12px 4px", border: "none", background: "none", fontSize: 12.5, fontWeight: 600, color: "#655d4f", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
            다시 보지 않기
          </button>
          <div style={{ flex: 1 }} />
          {index > 0 && (
            <button onClick={() => go(index - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #DDD5C2", background: "white", fontSize: 13, fontWeight: 700, color: "#6d665b", cursor: "pointer" }}>
              이전
            </button>
          )}
          <button onClick={() => (last ? close(false) : go(index + 1))} style={{ padding: "12px 22px", borderRadius: 12, border: "none", background: GREEN, fontSize: 13.5, fontWeight: 800, color: "white", cursor: "pointer" }}>
            {last ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </>
  );
}
