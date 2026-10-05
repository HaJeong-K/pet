import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  MapPin, Dog, Footprints, MessageCircleHeart, Flag, PawPrint, Store, ArrowRight,
  Home, Trees, Stethoscope, Bell, Bookmark, BadgeCheck, BarChart3, Search,
} from "lucide-react";
import { siteUrl } from "@/lib/siteUrl";

// ── 서비스 소개(/about) ──
// 처음 온 사람이 "여기가 뭐 하는 곳인지"를 한 화면씩 넘기며 알 수 있게 한 소개 페이지.
// 구성: 첫 화면(한 줄 소개) → 핵심 기능 5가지 → 쓰는 방법 3단계 → 사장님 안내 → 자주 묻는 질문 → 시작하기
// 숫자(등록 장소 수 등)는 과장 없이 실제 데이터 기준으로 적고, 공공데이터 출처를 함께 밝힙니다.

const title = "같이가개 소개 | 반려동물과 갈 수 있는 곳, 지도에서 바로";
const description = "카페·식당·여행지·병원까지, 반려동물 동반 가능 여부를 가기 전에 지도에서 확인하세요. AI 산책 코스, 후기, 유기동물 입양 공고도 함께 볼 수 있어요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/about` },
  openGraph: { title, description, url: `${siteUrl}/about`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/api/og", width: 1200, height: 630 }] },
};

const GREEN = "#5C7A4A", DARK = "#2f3a26", BEIGE = "#F7F3E8";

const FEATURES = [
  {
    no: "01", Icon: Dog, tone: "#E4EBDC", color: "#48603A",
    title: ["가기 전에,", "동반 가능 여부가 먼저 보여요."],
    text: "실내 동반인지, 야외만 되는지, 대형견도 괜찮은지. 헛걸음하기 전에 지도에서 바로 확인해요.",
    chips: [{ Icon: Home, label: "실내 가능" }, { Icon: Trees, label: "야외 가능" }, { Icon: Stethoscope, label: "동물병원·약국" }, { Icon: Trees, label: "공원" }],
  },
  {
    no: "02", Icon: Footprints, tone: "#EDE7FE", color: "#5b21b6",
    title: ["오늘 산책 코스,", "AI가 짜드려요."],
    text: "내 위치 주변에서 걷기 좋은 순서로 3~4곳을 이어 드려요. 산책·관광·실내 테마를 고르고, 마음에 드는 코스는 저장해 두세요.",
    chips: [{ Icon: Footprints, label: "산책 중심" }, { Icon: MapPin, label: "관광 중심" }, { Icon: Home, label: "실내 추천" }, { Icon: Bookmark, label: "코스 저장" }],
  },
  {
    no: "03", Icon: MessageCircleHeart, tone: "#FDEBDD", color: "#B4532A",
    title: ["정말 괜찮은 곳인지,", "다녀온 보호자가 알려줘요."],
    text: "후기와 추천·찜 반응을 모아 반려동물 친화도 점수로 보여 드려요. 사장님이 직접 남긴 답글에는 인증 배지가 붙어요.",
    chips: [{ Icon: MessageCircleHeart, label: "방문 후기" }, { Icon: BadgeCheck, label: "사장님 답글" }, { Icon: PawPrint, label: "친화도 점수" }],
  },
  {
    no: "04", Icon: Flag, tone: "#FDE3E1", color: "#B42318",
    title: ["달라진 정보는", "같이 고쳐요."],
    text: "새로 알게 된 장소는 제보로, 가 보니 동반이 안 되던 곳은 신고로 알려 주세요. 한 사람의 제보가 다음 보호자의 헛걸음을 줄여요.",
    chips: [{ Icon: MapPin, label: "장소 제보" }, { Icon: Flag, label: "잘못된 정보 신고" }],
  },
  {
    no: "05", Icon: PawPrint, tone: "#FFF3DF", color: "#7A4A26",
    title: ["가족을 기다리는 아이들,", "내 동네부터 보여요."],
    text: "전국 보호소의 유기동물 공고를 내 위치 기준으로 보여 드려요. 지역을 골라 알림을 켜 두면 새 공고가 올라올 때 알려 드려요.",
    chips: [{ Icon: MapPin, label: "내 주변 공고" }, { Icon: Bell, label: "새 공고 알림" }],
  },
];

const STEPS = [
  { no: "01", title: "지도를 열어요", text: "현재 위치나 가 보고 싶은 동네부터 봐요.", Icon: Search },
  { no: "02", title: "조건으로 골라요", text: "동반 범위와 후기, 친화도 점수로 오늘 갈 곳을 정해요.", Icon: Dog },
  { no: "03", title: "다녀와서 알려줘요", text: "후기를 남기고, 정보가 달라졌다면 다음 보호자에게 알려 주세요.", Icon: MessageCircleHeart },
];

const FAQ = [
  { q: "로그인하지 않아도 볼 수 있나요?", a: "네. 지도, 장소 정보, 후기, 입양 공고는 로그인 없이 볼 수 있어요. 찜하기, 코스 저장, 커뮤니티 글쓰기는 로그인이 필요해요." },
  { q: "장소 정보는 어디서 오나요?", a: "한국관광공사(반려동물 동반여행), 한국문화정보원(반려동물 동반 가능 문화시설), 식품의약품안전처(반려동물 동반출입 음식점), 행정안전부(전국도시공원) 공공데이터와 이용자 제보, 사장님이 직접 등록한 정보를 함께 보여 드려요. 유기동물 공고는 국가동물보호정보시스템 공고예요." },
  { q: "실제와 정보가 다르면 어떻게 하나요?", a: "장소 상세의 ⋮ 메뉴에서 '장소 신고하기'를 눌러 주세요. 직접 확인한 뒤 고치거나 지도에서 내려요. 방문 전에 가게에 한 번 더 확인하시면 가장 정확해요." },
  { q: "이용 요금이 있나요?", a: "보호자가 쓰는 기능은 모두 무료예요." },
  { q: "휴대폰에서도 쓸 수 있나요?", a: "휴대폰 브라우저에서 바로 쓸 수 있어요. 지금은 PC 화면을 기준으로 만든 시범 운영 단계라 일부 화면이 불편할 수 있고, 계속 다듬고 있어요." },
  { q: "우리 가게도 등록할 수 있나요?", a: "네. 사장님으로 가입해 사업자 인증을 마치면 가게 정보를 직접 관리하고, 고객 후기에 사장님 답글을 달 수 있어요." },
];

const wrap: React.CSSProperties = { width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 22px", boxSizing: "border-box" };

export default function AboutPage() {
  return (
    // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: BEIGE, color: DARK, wordBreak: "keep-all" }}>
      {/* ── 상단 ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(247,243,232,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #e8e2d2" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, height: 58 }}>
          <Link href="/" aria-label="같이가개 지도" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/icons/header_logo_final.png" alt="같이가개" width={132} height={56} style={{ objectFit: "contain", height: 40, width: "auto" }} priority />
          </Link>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* 좁은 화면에서는 로고와 "지도 열기"만 남깁니다 */}
            <style>{`@media (max-width: 640px) { .about-nav-link { display: none; } }`}</style>
            <a href="#features" className="about-nav-link" style={navLink}>기능</a>
            <a href="#owners" className="about-nav-link" style={navLink}>사장님</a>
            <a href="#faq" className="about-nav-link" style={navLink}>자주 묻는 질문</a>
            <Link href="/" style={{ marginLeft: 6, padding: "9px 16px", borderRadius: 999, background: GREEN, color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>지도 열기</Link>
          </nav>
        </div>
      </header>

      {/* ── 첫 화면 ── */}
      <section style={{ background: "linear-gradient(160deg,#48603A,#5C7A4A 55%,#7b9a66)", color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(48px, 9vw, 96px) 22px clamp(44px, 8vw, 84px)" }}>
          <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.2px" }}>
            반려동물 동반 장소 지도
          </div>
          <h1 className="ggk-logo" style={{ margin: "18px 0 0", fontSize: "clamp(30px, 6.4vw, 56px)", fontWeight: 800, lineHeight: 1.22 }}>
            반려동물과 갈 수 있는 곳,<br />
            <span style={{ color: "#FFE9A8" }}>지도에서 바로.</span>
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: "clamp(15px, 2.4vw, 18px)", lineHeight: 1.7, color: "rgba(255,255,255,0.92)", maxWidth: 560 }}>
            카페·식당·여행지·병원까지, 동반 가능 여부를 가기 전에 확인해요.<br />
            헛걸음은 줄이고, 함께하는 하루는 길게.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 999, background: "#FFE9A8", color: "#3b3215", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
              내 주변 장소 보기 <ArrowRight size={17} />
            </Link>
            <Link href="/shelter-notices" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.55)", color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              <PawPrint size={16} /> 입양 공고 보기
            </Link>
          </div>
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, maxWidth: 640 }}>
            {[["3.2만+", "동반 가능 장소"], ["1.7만+", "전국 도시공원"], ["매일", "보호소 공고 갱신"]].map(([value, label]) => (
              <div key={label} style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.13)" }}>
                <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>2026년 10월 기준 · 공공데이터와 이용자 제보를 합한 수</div>
        </div>
      </section>

      {/* ── 핵심 기능 ── */}
      <section id="features" style={{ ...wrap, padding: "clamp(40px, 7vw, 72px) 22px 8px", scrollMarginTop: 60 }}>
        {FEATURES.map((f, i) => (
          <div key={f.no} style={{ display: "flex", gap: "clamp(16px, 4vw, 44px)", alignItems: "center", flexWrap: "wrap", flexDirection: i % 2 ? "row-reverse" : "row", marginBottom: "clamp(36px, 6vw, 64px)" }}>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: f.color }}>{f.no}</div>
              <h2 className="ggk-logo" style={{ margin: "8px 0 0", fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 800, lineHeight: 1.32 }}>
                {f.title[0]}<br />{f.title[1]}
              </h2>
              <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.75, color: "#59624f" }}>{f.text}</p>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0, borderRadius: 26, background: f.tone, padding: "clamp(22px, 4vw, 36px)" }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, background: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.07)" }}>
                <f.Icon size={26} color={f.color} />
              </div>
              <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {f.chips.map((c) => (
                  <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 999, background: "white", color: f.color, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <c.Icon size={14} />{c.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── 쓰는 방법 ── */}
      <section style={{ background: "white", borderTop: "1px solid #ece6d6", borderBottom: "1px solid #ece6d6" }}>
        <div style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>같이가개를 쓰는 가장 짧은 방법</div>
          <h2 className="ggk-logo" style={{ margin: "8px 0 0", fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 800 }}>열고, 고르고, 함께 가요.</h2>
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {STEPS.map((s) => (
              <div key={s.no} style={{ padding: "22px 20px", borderRadius: 20, background: BEIGE, border: "1px solid #ece6d6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ggk-logo" style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>{s.no}</span>
                  <s.Icon size={18} color={GREEN} />
                </div>
                <div className="ggk-logo" style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }}>{s.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.65, color: "#59624f" }}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 사장님 ── */}
      <section id="owners" style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px", scrollMarginTop: 60 }}>
        <div style={{ borderRadius: 28, background: "#FFF8E6", border: "1px solid #F3DFA6", padding: "clamp(24px, 5vw, 44px)", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "#F59E0B", color: "white", fontSize: 12.5, fontWeight: 800 }}>
              <Store size={13} /> 사장님이라면
            </div>
            <h2 className="ggk-logo" style={{ margin: "12px 0 0", fontSize: "clamp(22px, 3.6vw, 30px)", fontWeight: 800, lineHeight: 1.35, color: "#5b3d05" }}>
              반려동물과 함께 오는 손님을<br />가게로 맞이하세요.
            </h2>
            <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.75, color: "#7a5a17" }}>
              사업자 인증을 마치면 가게 정보를 직접 관리하고, 고객 후기에 사장님 답글을 달 수 있어요. 우리 가게를 몇 명이 봤는지도 확인할 수 있어요.
            </p>
            <Link href="/signup-owner" style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 20px", borderRadius: 999, background: "#B45309", color: "white", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>
              사장님으로 시작하기 <ArrowRight size={16} />
            </Link>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 0, display: "grid", gap: 10 }}>
            {[[Store, "가게 정보 직접 관리", "영업시간·동반 조건·사진을 최신으로"], [BadgeCheck, "사장님 답글", "인증 배지와 함께 고객 후기에 답해요"], [BarChart3, "우리 가게 통계", "조회·찜·길찾기·코스 노출 수 확인"]].map(([Icon, t, d]) => {
              const I = Icon as typeof Store;
              return (
                <div key={t as string} style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 15px", borderRadius: 16, background: "white", border: "1px solid #F3DFA6" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I size={18} color="#B45309" /></div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#5b3d05" }}>{t as string}</div>
                    <div style={{ fontSize: 12.5, color: "#8a6a25", marginTop: 1 }}>{d as string}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 자주 묻는 질문 ── */}
      <section id="faq" style={{ ...wrap, padding: "0 22px clamp(40px, 7vw, 68px)", scrollMarginTop: 60 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>FAQ</div>
        <h2 className="ggk-logo" style={{ margin: "8px 0 18px", fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 800 }}>먼저 궁금한 것들.</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {FAQ.map((item) => (
            <details key={item.q} style={{ borderRadius: 16, background: "white", border: "1px solid #ece6d6", padding: "0 18px" }}>
              <summary style={{ cursor: "pointer", padding: "16px 0", fontSize: 15, fontWeight: 700, listStyle: "none" }}>{item.q}</summary>
              <div style={{ padding: "0 0 16px", fontSize: 14, lineHeight: 1.75, color: "#59624f" }}>{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── 시작하기 ── */}
      <section style={{ background: DARK, color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(44px, 8vw, 80px) 22px clamp(120px, 14vw, 140px)", textAlign: "center" }}>
          <h2 className="ggk-logo" style={{ margin: 0, fontSize: "clamp(24px, 4.4vw, 38px)", fontWeight: 800, lineHeight: 1.35 }}>
            오늘 산책,<br />어디로 갈지부터 보고 가요.
          </h2>
          <Link href="/" style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 26px", borderRadius: 999, background: "#FFE9A8", color: "#3b3215", fontSize: 16, fontWeight: 800, textDecoration: "none" }}>
            같이가개 시작하기 <ArrowRight size={18} />
          </Link>
          <div style={{ marginTop: 26, fontSize: 11.5, lineHeight: 1.8, color: "rgba(255,255,255,0.55)" }}>
            장소 정보 출처: 한국관광공사 · 한국문화정보원 · 식품의약품안전처 · 행정안전부 공공데이터 / 유기동물 공고: 국가동물보호정보시스템<br />
            문의: infoker12@naver.com
          </div>
        </div>
      </section>
    </div>
  );
}

const navLink: React.CSSProperties = { padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#48603A", textDecoration: "none", whiteSpace: "nowrap" };
