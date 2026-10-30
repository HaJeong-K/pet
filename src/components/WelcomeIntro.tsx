"use client";

// 첫 방문 소개 — 맨 앞 장에서 "무엇을 하러 오셨나요?"를 고르면 그 목적에 맞는 세 장을 보여 주고,
// 마지막 버튼은 그 목적의 화면으로 데려다줍니다. 고른 목적은 지도 안내(src/lib/pageGuides.ts)에도 쓰입니다.
//
// 언제 뜨나
//  · 이 기기에서 끝까지 보거나 "다시 보지 않기"를 누를 때까지, 앱(사이트)을 새로 열면 한 번씩 뜹니다.
//  · X로 닫으면 이번 방문에서만 닫힙니다.
// 각 장은 "그림 → 제목 두 줄 → 설명 한두 줄"의 같은 틀이라, 넘겨도 글자 위치가 흔들리지 않습니다.

import { useEffect, useRef, useState, type ComponentType } from "react";
import { BedDouble, Check, ChevronRight, ClipboardList, Copy, MapPin, MessageSquare, Pill, Search, ShoppingBag, Store, Trees, Utensils, X } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import { setGuideInterest, type GuideInterest } from "@/lib/pageGuides";

const CONTACT_EMAIL = "infoker12@naver.com";
/** 끝까지 봤거나 "다시 보지 않기"를 눌렀는지(기기에 계속 남음). 소개 내용을 크게 바꾸면 끝의 숫자를 올립니다. */
const NEVER_KEY = "ggk_intro_never_v3";
/** 이번 방문에서 이미 봤는지(앱·탭을 닫으면 지워짐) */
const SESSION_KEY = "ggk_intro_seen_v3";

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
const whiteCard: React.CSSProperties = { background: "white", borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };
const artBox = (background: string): React.CSSProperties => ({ width: "100%", height: "100%", borderRadius: 16, background, padding: "14px 16px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: 9 });

// ── 장마다의 그림(화면 일부를 흉내 낸 작은 그림 — 실제 화면에서 보게 될 모습 그대로) ──

function MapArt() {
  const pills = [
    { left: "9%", top: "20%", Icon: Store, label: "실내 동반 카페" },
    { left: "56%", top: "14%", Icon: Utensils, label: "야외 테라스" },
    { left: "60%", top: "68%", Icon: Pill, label: "동물약국" },
    { left: "8%", top: "70%", Icon: Trees, label: "공원" },
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/default-place.png" alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {pills.map(({ left, top, Icon, label }) => (
        <span key={label} style={{ position: "absolute", left, top, display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, background: "white", fontSize: 11, fontWeight: 700, color: INK, boxShadow: "0 2px 6px rgba(0,0,0,0.14)", whiteSpace: "nowrap" }}>
          <Icon size={12} color={GREEN} />{label}
        </span>
      ))}
    </div>
  );
}

function SearchArt() {
  return (
    <div style={{ ...artBox("#EEF3E8"), gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderRadius: 999, background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        <Search size={15} color="#7c867c" />
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

function CourseArt() {
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
    <div style={{ ...artBox("#FBF3E4"), flexDirection: "row", alignItems: "stretch", gap: 12 }}>
      <div style={{ ...whiteCard, flex: 1.25, minWidth: 0, padding: 12, display: "flex", flexDirection: "column", justifyContent: "center", gap: 9 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: GREEN }}>산책 코스 · 1.7km</div>
        {stop(1, "동네 공원", "산책 · 도보 6분")}
        {stop(2, "테라스 카페", "쉬어 가기")}
        {stop(3, "동반 식당", "저녁")}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...whiteCard, flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10.5, color: "#5f5f56", fontWeight: 600 }}>반려동물 친화도</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BROWN, lineHeight: 1.2 }}>87<span style={{ fontSize: 12 }}>점</span></div>
        </div>
        <div style={{ ...whiteCard, flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10.5, color: "#5f5f56", fontWeight: 600 }}>다녀온 보호자 후기</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.4 }}>&ldquo;대형견도 편했어요&rdquo;</div>
        </div>
      </div>
    </div>
  );
}

function TogetherArt() {
  return (
    <div style={{ ...artBox("#EFEAF6"), gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["장소 제보 +50", "정보 추가 +20", "후기 +10", "장소 사진 +5"].map((text) => (
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

function StayArt() {
  const row = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#4b463d" }}><span>{label}</span><b style={{ color: INK }}>{value}</b></div>
  );
  return (
    <div style={artBox("#E9EFF6")}>
      <div style={{ ...whiteCard, padding: "12px 14px", display: "grid", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: INK }}><BedDouble size={15} color="#1D4F91" />숲속 독채 · 1박</div>
        {row("객실 요금", "120,000원")}
        {row("반려동물 2마리", "20,000원")}
        <div style={{ height: 1, background: "#eee" }} />
        {row("현장에서 더 낼 돈", "없음")}
      </div>
    </div>
  );
}

function NearbyArt() {
  return (
    <div style={artBox("#EEF3E8")}>
      {[{ Icon: BedDouble, name: "숲속 독채", sub: "오늘 머무는 숙소", tone: "#1D4F91" }, { Icon: Trees, name: "강변 공원", sub: "도보 8분", tone: GREEN }, { Icon: Utensils, name: "동반 식당", sub: "차로 5분", tone: BROWN }].map(({ Icon, name, sub, tone }) => (
        <div key={name} style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
          <Icon size={16} color={tone} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: INK }}>{name}</span>
          <span style={{ fontSize: 11, color: "#5f5f56" }}>{sub}</span>
        </div>
      ))}
    </div>
  );
}

function OrdersArt() {
  const rows = [
    { name: "숲속 독채 · 1박", state: "예약 확정", bg: "#DCFCE7", color: "#15803D", action: "취소 신청" },
    { name: "테라스 카페 · 포장", state: "준비 완료", bg: "#DBEAFE", color: "#1D4ED8", action: "영수증" },
    { name: "동반 식당 · 매장 식사", state: "이용 완료", bg: "#F1ECE1", color: "#5a5141", action: "후기 쓰기" },
  ];
  return (
    <div style={artBox("#FBF3E4")}>
      {rows.map((r) => (
        <div key={r.name} style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 8, padding: "8px 11px" }}>
          <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 999, background: r.bg, color: r.color, fontSize: 10, fontWeight: 800 }}>{r.state}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: BROWN }}>{r.action}</span>
        </div>
      ))}
    </div>
  );
}

function ShopArt() {
  return (
    <div style={artBox("#FBF3E4")}>
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ flex: 1, padding: "8px 4px", borderRadius: 10, background: BROWN, color: "white", fontSize: 12, fontWeight: 800, textAlign: "center" }}>포장 주문</span>
        <span style={{ flex: 1, padding: "8px 4px", borderRadius: 10, background: "white", border: "1px solid #E8DFD2", color: "#5F4D3A", fontSize: 12, fontWeight: 800, textAlign: "center" }}>매장 식사 예약</span>
      </div>
      {[["수제 오리 간식", "6,500원"], ["아메리카노", "4,500원"]].map(([name, price]) => (
        <div key={name} style={{ ...whiteCard, display: "flex", justifyContent: "space-between", padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: INK }}><span>{name}</span><span>{price}</span></div>
      ))}
    </div>
  );
}

function VisitArt() {
  const steps = [{ Icon: ShoppingBag, text: "메뉴를 고르고 시간을 정해요" }, { Icon: Check, text: "가게가 주문을 확정해요" }, { Icon: MapPin, text: "시간에 맞춰 편하게 가요" }];
  return (
    <div style={artBox("#EEF3E8")}>
      {steps.map(({ Icon, text }) => (
        <div key={text} style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: INK }}><Icon size={15} color={GREEN} />{text}</div>
      ))}
    </div>
  );
}

function OwnerArt() {
  const steps = ["사장님으로 가입", "입점 상담 신청", "승인 후 예약·주문 받기"];
  return (
    <div style={artBox("#F3E7D8")}>
      {steps.map((text, i) => (
        <div key={text} style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: INK }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "#4A3021", color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>{text}
        </div>
      ))}
    </div>
  );
}

function OwnerManageArt() {
  return (
    <div style={artBox("#EEF3E8")}>
      <div style={{ ...whiteCard, padding: "11px 13px", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: INK }}><ClipboardList size={14} color={GREEN} />새 주문 · 포장 2건</div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ flex: 1, padding: "7px 0", borderRadius: 9, background: "#B45309", color: "white", fontSize: 12, fontWeight: 800, textAlign: "center" }}>확정</span>
          <span style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #f3c7c5", color: "#b42318", fontSize: 12, fontWeight: 800 }}>거절</span>
        </div>
      </div>
      <div style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, color: INK }}><MessageSquare size={14} color={GREEN} />답글을 기다리는 후기 3개</div>
    </div>
  );
}

function OwnerReachArt() {
  return (
    <div style={artBox("#FBF3E4")}>
      {[{ Icon: MapPin, text: "지도와 장소 화면에 입점 표시" }, { Icon: BedDouble, text: "숙소는 숙소 탭에서 예약" }, { Icon: ShoppingBag, text: "카페·식당·간식은 쇼핑 탭에서 주문" }].map(({ Icon, text }) => (
        <div key={text} style={{ ...whiteCard, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700, color: INK }}><Icon size={15} color={BROWN} />{text}</div>
      ))}
    </div>
  );
}

type Slide = { Art: ComponentType; title: [string, string]; text: string };

// 목적별 세 장 — 사장님용은 합니다체
const TRACKS: Record<GuideInterest, { slides: Slide[]; cta: string; href: string | null }> = {
  places: {
    cta: "지도 보러 가기", href: null,
    slides: [
      { Art: MapArt, title: ["같이 갈 수 있는 곳,", "지도에서 한눈에"], text: "카페·식당·여행지·병원·공원까지\n반려동물 동반 정보를 모았어요." },
      { Art: SearchArt, title: ["찾고 싶은 대로,", "말하듯이 검색해요"], text: "가게 이름이나 지역은 물론,\n‘우리동네 핫플’처럼 써도 알아들어요." },
      { Art: CourseArt, title: ["오늘 어디 갈지,", "같이 골라 드려요"], text: "산책 코스와 취향 추천, 친화도 점수와\n다녀온 보호자의 후기로 정해 보세요." },
      { Art: TogetherArt, title: ["보호자들이", "함께 채우는 지도예요"], text: "제보·후기·사진을 남기면 레벨이 올라가요.\n달라진 정보는 신고로 알려 주세요." },
    ],
  },
  stay: {
    cta: "동반 숙소 보러 가기", href: "/stay",
    slides: [
      { Art: StayArt, title: ["반려동물 요금까지", "예약할 때 한 번에"], text: "객실과 동반 규정을 확인하고,\n추가 요금까지 포함한 금액으로 예약해요." },
      { Art: NearbyArt, title: ["숙소 주변 갈 곳도", "지도에서 이어서"], text: "숙소 근처의 공원과 동반 식당을\n지도에서 함께 찾아볼 수 있어요." },
      { Art: OrdersArt, title: ["예약 뒤의 일도", "한곳에서 해결해요"], text: "주문·예약 내역에서 환불 금액을 확인하고\n취소를 신청하거나 후기를 남겨요." },
    ],
  },
  shop: {
    cta: "쇼핑 탭 보러 가기", href: "/shop",
    slides: [
      { Art: ShopArt, title: ["우리 아이와 갈 가게,", "미리 주문해요"], text: "입점한 카페·식당·수제 간식 가게의 메뉴를\n포장 주문이나 매장 식사 예약으로 받아요." },
      { Art: VisitArt, title: ["기다리지 않고", "시간 맞춰 가요"], text: "가게가 주문을 확정하면 알려 드려요.\n입점 가게는 계속 늘려 가는 중이에요." },
      { Art: OrdersArt, title: ["주문한 내역은", "한곳에서 확인해요"], text: "주문·예약 내역에서 진행 상태를 보고\n취소를 신청하거나 후기를 남겨요." },
    ],
  },
  owner: {
    cta: "사장님으로 시작하기", href: "/signup-owner",
    slides: [
      { Art: OwnerArt, title: ["입점 상담부터", "차근차근 진행합니다"], text: "같이가개에 가입한 사장님이면\n누구나 입점 상담을 받을 수 있습니다." },
      { Art: OwnerReachArt, title: ["반려동물 손님에게", "우리 가게를 알립니다"], text: "동반 장소를 찾는 보호자에게\n예약과 주문을 직접 받을 수 있습니다." },
      { Art: OwnerManageArt, title: ["예약과 후기를", "사장님 센터에서 관리합니다"], text: "새 예약·주문 확인, 후기 답글, 공지 등록을\n한 화면에서 처리할 수 있습니다." },
    ],
  },
};

const CHOICES: { id: GuideInterest; Icon: typeof MapPin; title: string; sub: string }[] = [
  { id: "places", Icon: MapPin, title: "함께 갈 장소 찾기", sub: "카페·식당·공원·병원, 산책 코스" },
  { id: "stay", Icon: BedDouble, title: "동반 숙소 예약", sub: "객실·동반 규정 확인, 예약" },
  { id: "shop", Icon: ShoppingBag, title: "포장·매장 식사 주문", sub: "입점 가게의 메뉴 미리 주문" },
  { id: "owner", Icon: Store, title: "저는 사장님이에요", sub: "우리 가게·숙소 입점 상담" },
];

export default function WelcomeIntro({ onClose }: { onClose: () => void }) {
  const [interest, setInterest] = useState<GuideInterest | null>(null);
  // 0 = 목적 고르기, 1부터 목적별 장
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const touchX = useRef<number | null>(null);
  const track = interest ? TRACKS[interest] : null;
  const slides = track?.slides ?? [];
  const lastIndex = slides.length;
  const last = index === lastIndex && index > 0;
  // 의견 메일 줄은 첫 장과 마지막 장에서 보입니다.
  const showContact = index === 0 || last;

  const close = (never: boolean) => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (never) localStorage.setItem(NEVER_KEY, "1");
    } catch { /* 저장 실패는 무시 */ }
    onClose();
  };
  const go = (next: number) => setIndex(Math.max(0, Math.min(lastIndex, next)));
  const choose = (id: GuideInterest) => {
    setGuideInterest(id);
    setInterest(id);
    setIndex(1);
  };
  const finish = () => {
    close(true);
    if (track?.href) window.location.assign(track.href);
  };

  // 키보드: 좌우 화살표로 넘기고 Esc로 닫습니다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(lastIndex, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIndex]);

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

        {/* 본문: 옆으로 넘기는 장들 */}
        <div
          style={{ overflow: "hidden auto", flex: "1 1 auto", minHeight: 0 }}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current == null || !interest) return;
            const moved = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(moved) > 40) go(index + (moved < 0 ? 1 : -1));
          }}
        >
          <div style={{ display: "flex", transform: `translateX(-${index * 100}%)`, transition: "transform 0.28s ease" }}>
            {/* 첫 장: 목적 고르기 */}
            <div aria-hidden={index !== 0} style={{ flex: "0 0 100%", minWidth: 0, padding: "8px 18px 0", boxSizing: "border-box" }}>
              <div className="ggk-logo" style={{ fontSize: 21, fontWeight: 800, color: INK, lineHeight: 1.32 }}>
                반가워요!<br /><span style={{ color: GREEN }}>무엇을 하러 오셨나요?</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13.5, color: "#5d574e", lineHeight: 1.6 }}>고르신 목적에 맞춰 안내해 드릴게요.</div>
              <div style={{ display: "grid", gap: 8, marginTop: 13 }}>
                {CHOICES.map(({ id, Icon, title, sub }) => {
                  const on = interest === id;
                  return (
                    <button key={id} onClick={() => choose(id)} tabIndex={index === 0 ? 0 : -1} aria-pressed={on} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 14, border: `1.5px solid ${on ? GREEN : "#E6E0D0"}`, background: on ? "#F1F5EC" : "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: "#EEF3E8", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={GREEN} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: INK }}>{title}</span>
                        <span style={{ display: "block", marginTop: 1, fontSize: 12, color: "#5d574e" }}>{sub}</span>
                      </span>
                      <ChevronRight size={16} color="#7a7263" style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </div>
            {slides.map(({ Art, title, text }, i) => (
              <div key={title[0]} aria-hidden={i + 1 !== index} style={{ flex: "0 0 100%", minWidth: 0, padding: "8px 18px 0", boxSizing: "border-box" }}>
                <div style={{ height: 226 }}><Art /></div>
                <div className="ggk-logo" style={{ marginTop: 16, fontSize: 21, fontWeight: 800, color: INK, lineHeight: 1.32 }}>
                  {title[0]}<br /><span style={{ color: GREEN }}>{title[1]}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13.5, color: "#5d574e", lineHeight: 1.65, whiteSpace: "pre-line" }}>{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 시범 운영 안내 — 첫 장과 마지막 장에서만 보입니다(자리는 늘 같아서 높이가 흔들리지 않습니다) */}
        <div style={{ margin: "10px 18px 0", height: 40, flexShrink: 0, visibility: showContact ? "visible" : "hidden" }}>
          <div style={{ height: "100%", padding: "0 12px", borderRadius: 12, background: "white", border: "1px solid #ECE6D6", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flexShrink: 0, padding: "3px 7px", borderRadius: 999, background: "#5C7A4A", color: "white", fontSize: 10, fontWeight: 800 }}>시범 운영 중</span>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[같이가개] 의견 보내기")}`} style={{ flex: 1, minWidth: 0, fontSize: 11.5, letterSpacing: "-0.2px", color: INK, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{CONTACT_EMAIL}</a>
            <button onClick={copyEmail} tabIndex={showContact ? 0 : -1} style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 8, border: "1px solid #dcd6c6", background: "white", fontSize: 11, fontWeight: 700, color: copied ? "#2F7D46" : "#555", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {copied ? <><Check size={11} />복사됨</> : <><Copy size={11} />복사</>}
            </button>
          </div>
        </div>

        {/* 점 · 버튼 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "12px 0 4px", minHeight: 7, flexShrink: 0 }}>
          {interest && [0, ...slides.map((_, i) => i + 1)].map((i) => (
            <button key={i} onClick={() => go(i)} aria-label={`${i + 1}번째 소개`} aria-current={i === index}
              style={{ width: i === index ? 20 : 7, height: 7, borderRadius: 999, border: "none", padding: 0, background: i === index ? GREEN : "#CFC7B3", cursor: "pointer", transition: "width 0.2s" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 18px", flexShrink: 0 }}>
          <button onClick={() => close(true)} style={{ padding: "12px 4px", border: "none", background: "none", fontSize: 12.5, fontWeight: 600, color: "#655d4f", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
            다시 보지 않기
          </button>
          <div style={{ flex: 1 }} />
          {index > 0 && (
            <button onClick={() => go(index - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #DDD5C2", background: "white", fontSize: 13, fontWeight: 700, color: "#6d665b", cursor: "pointer" }}>
              이전
            </button>
          )}
          {interest && (
            <button onClick={() => (last ? finish() : go(index + 1))} style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: GREEN, fontSize: 13.5, fontWeight: 800, color: "white", cursor: "pointer", whiteSpace: "nowrap" }}>
              {last ? track?.cta : "다음"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
