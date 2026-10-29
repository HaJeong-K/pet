import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Megaphone, Handshake, MapPin, BarChart3, ArrowRight, Store, PawPrint, Type, Scale, MessageSquareText,
  Search, Users, HeartHandshake, ShieldCheck, Ban, BadgeCheck, Building2, Bone, Gift, Map as MapIcon,
} from "lucide-react";
import { siteUrl } from "@/lib/siteUrl";
import { OWNER_PLANS, won } from "@/lib/ownerPlans";
import PartnershipForm from "./PartnershipForm";

// ── 광고·제휴 안내(/partnership) ──
// 사이트 아래의 "광고·제휴 문의"에서 들어옵니다. 광고주·제휴사가 읽는 사업 안내 화면이라 용어와 말투를 그에 맞춥니다
// ("할 수 있는 것" 같은 풀어 쓴 말 대신 "광고·제휴 상품", "집행 방식", "진행 절차", "운영 정책").
// 구성: 이용자 특성 → 광고·제휴 상품 → 배너 집행 방식 → 진행 절차 → 요금 → 광고 운영 정책 → 자주 묻는 질문 → 문의 양식
// 대상은 동반 가게만이 아닙니다 — 사료·간식·용품 같은 브랜드 협업, 기관·서비스 제휴도 함께 안내합니다.
// ⚠ 가독성: 문장을 한 줄에 몰아 적지 않습니다. 글 안의 줄바꿈(\n)이 화면에 그대로 반영됩니다(whiteSpace: pre-line).
// 숫자는 과장 없이 확인할 수 있는 것만 적습니다(방문자 수처럼 확인되지 않은 수치는 싣지 않음).

const title = "광고·제휴 안내 | 같이가개";
const description = "반려동물과 함께 사는 보호자에게 매장·브랜드·상품을 알리는 방법을 안내합니다. 지역 배너 광고, 사료·간식·용품 브랜드 협업, 기관·서비스 제휴를 문의해 주세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/partnership` },
  openGraph: { title, description, url: `${siteUrl}/partnership`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

const GREEN = "#5C7A4A", DARK = "#2f3a26", BEIGE = "#F7F3E8";
const wrap: React.CSSProperties = { width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 22px", boxSizing: "border-box" };
const navLink: React.CSSProperties = { padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, color: "#59624f", textDecoration: "none", whiteSpace: "nowrap" };
const eyebrow: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: GREEN, letterSpacing: "0.2px" };
const h2: React.CSSProperties = { margin: "8px 0 0", fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 800, lineHeight: 1.36, whiteSpace: "pre-line" };
/** 본문 글 — 글 안의 줄바꿈을 그대로 보여 줍니다 */
const body = (size = 14): React.CSSProperties => ({ fontSize: size, lineHeight: 1.8, color: "#59624f", whiteSpace: "pre-line" });

const AUDIENCE = [
  { Icon: Search, title: "정보를 찾아 비교하는 보호자", text: "방문할 곳과 구매할 상품을\n직접 찾아보고 비교하는 이용자입니다.\n광고가 구매·방문 결정의 참고 정보로 쓰입니다." },
  { Icon: MapIcon, title: "생활권 중심의 이용", text: "현재 위치 주변을 기준으로 이용합니다.\n가까운 매장과 인근에서 살 수 있는 상품일수록\n실제 방문·구매로 이어지기 쉽습니다." },
  { Icon: Users, title: "반복 방문", text: "후기·커뮤니티·유기동물 공고를 보러\n꾸준히 다시 방문합니다.\n일회성 노출에 그치지 않습니다." },
];

const OFFERS = [
  {
    no: "01", Icon: MapPin, tone: "#FFF3DF", color: "#B45309",
    name: "지역 배너 광고", who: "반려동물 동반 매장",
    title: "매장이 있는 지역의 보호자에게\n배너로 노출합니다.",
    text: "매장과 관련이 깊은 이용자에게 먼저\n커뮤니티·마이페이지 배너로 노출합니다.\n\n문구·사진·글꼴을 직접 정하고,\n게시 전에 실제 노출 화면을 미리 확인할 수 있습니다.",
    chips: [{ Icon: Type, label: "문구·사진·글꼴 직접 제작" }, { Icon: MapPin, label: "소재지 우선 노출" }, { Icon: Scale, label: "매장 간 동일 노출" }],
  },
  {
    no: "02", Icon: Bone, tone: "#EDE7FE", color: "#5b21b6",
    name: "브랜드 협업", who: "사료·간식·용품 브랜드 · 제조사 · 대행사",
    title: "사료·간식·용품 브랜드와\n함께 기획합니다.",
    text: "사료·간식·영양제·용품부터 보험·여행·숙박까지,\n반려 가구 대상 브랜드와 협업합니다.\n\n신제품 소개, 체험·샘플 프로모션, 지역 매장 연계 등\n브랜드 목적에 맞는 방식을 협의해 정합니다.",
    chips: [{ Icon: Megaphone, label: "신제품·브랜드 소개" }, { Icon: Gift, label: "체험·샘플 프로모션" }, { Icon: Store, label: "지역 매장 연계" }, { Icon: BarChart3, label: "성과 리포트" }],
  },
  {
    no: "03", Icon: Handshake, tone: "#E4EBDC", color: "#48603A",
    name: "기관·서비스 제휴", who: "지자체 · 기관 · 단체 · 서비스",
    title: "공공·민간 서비스와\n제휴합니다.",
    text: "지자체·기관의 반려동물 정책·시설 안내,\n지역 행사, 유기동물 입양 홍보,\n장소 데이터 연계 등을 함께 추진합니다.",
    chips: [{ Icon: Building2, label: "지자체·기관" }, { Icon: HeartHandshake, label: "입양·보호 캠페인" }, { Icon: PawPrint, label: "데이터·서비스 연계" }],
  },
];

const HOW = [
  { Icon: MapPin, title: "매장: 생활권 우선", text: "매장 소재지에서 위치(GPS)를\n자주 켜는 이용자에게 먼저,\n다음으로 그 지역을 자주 검색한\n이용자에게 노출합니다." },
  { Icon: MapIcon, title: "숙소: 검색 지역 우선", text: "숙소가 있는 지역을\n자주 검색한 이용자에게 먼저,\n그 밖에는 전체 이용자에게\n고르게 노출합니다." },
  { Icon: Scale, title: "동일 노출 배분", text: "같은 지역에 매장이 여러 곳이면\n모든 매장을 같은 횟수로 노출합니다.\n금액에 따른 차등은 없습니다." },
  { Icon: BarChart3, title: "성과 확인", text: "노출 수와 클릭 수를 집계해\n사장님 화면에서\n바로 확인할 수 있습니다." },
];

const STEPS = [
  { no: "01", title: "문의 접수", text: "아래 양식에 홍보 대상과\n희망 지역·기간을 기재해 주세요." },
  { no: "02", title: "상담", text: "영업일 기준 2~3일 안에\n남겨 주신 연락처로 회신드립니다." },
  { no: "03", title: "조건 협의", text: "집행 방식·기간·비용을 협의하고\n광고 내용이 운영 정책에 맞는지\n검토합니다." },
  { no: "04", title: "집행 및 결과 보고", text: "협의한 일정에 맞춰 집행하고\n종료 후 노출·클릭 결과를\n정리해 드립니다." },
];

const RULES = [
  { Icon: BadgeCheck, title: "광고 표시", text: "모든 배너에 AD 표시를 붙입니다.\n후기나 추천으로 오인될 수 있는 형태로 게재하지 않습니다." },
  { Icon: ShieldCheck, title: "허위·과장 광고 제한", text: "사실과 다른 내용, 확인되지 않은 효능 표현,\n타 업체 비방, 타인의 사진·상표를 사용한 광고는 게재를 중단합니다." },
  { Icon: Ban, title: "동물 매매 광고 불가", text: "분양·교배 홍보는 받지 않습니다.\n같이가개는 입양을 권장합니다." },
];

const FAQ = [
  { q: "매장을 운영 중입니다. 반드시 문의해야 하나요?", a: "아닙니다.\n사장님으로 가입해 사업자 인증을 마치면\n사장님 화면에서 요금제를 선택하고 배너를 직접 제작할 수 있습니다.\n\n추가로 확인이 필요한 사항이 있을 때 문의해 주세요." },
  { q: "오프라인 매장이 없는 브랜드도 가능한가요?", a: "가능합니다.\n사료·간식·용품처럼 매장 없이 판매하는 브랜드도 협업할 수 있습니다.\n\n홍보할 상품과 희망 방식을 기재해 주시면\n적합한 방법을 제안드립니다." },
  { q: "광고비를 더 내면 더 많이 노출되나요?", a: "지역 배너 광고는 그렇지 않습니다.\n같은 지역의 매장은 모두 같은 횟수로 노출되며,\n매장 간 차등을 두지 않습니다." },
  { q: "배너 내용은 얼마나 자주 변경할 수 있나요?", a: "2주에 1회 변경할 수 있습니다.\n\n오탈자 등 급히 수정해야 하는 경우\n사장님 화면에서 변경 한도 해제를 요청하시면 확인 후 처리합니다." },
  { q: "광고 효과를 보장하나요?", a: "노출 기회를 제공하는 상품이며,\n방문자 수나 매출 증가를 보장하지는 않습니다.\n\n노출 수와 클릭 수는 그대로 공개합니다." },
  { q: "게재할 수 없는 광고는 무엇인가요?", a: "아래에 해당하는 광고는 받지 않습니다.\n\n· 동물 판매·분양\n· 사실 확인이 되지 않는 효능 표현\n· 반려동물에게 해로울 수 있는 상품\n· 관계 법령에 어긋나는 광고" },
  { q: "회신은 언제 받을 수 있나요?", a: "영업일 기준 2~3일 안에\n남겨 주신 이메일 또는 전화로 연락드립니다." },
];

export default function PartnershipPage() {
  const paidPlans = OWNER_PLANS.filter((p) => p.id !== "basic");
  return (
    // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: BEIGE, color: DARK, wordBreak: "keep-all" }}>
      {/* ── 상단 ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(247,243,232,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #e8e2d2" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, height: 58 }}>
          <Link href="/" aria-label="같이가개 지도" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ objectFit: "contain", height: 38, width: "auto" }} priority />
          </Link>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* 좁은 화면에서는 로고와 "문의하기"만 남깁니다 */}
            <style>{`@media (max-width: 720px) { .partner-nav-link { display: none; } }`}</style>
            <a href="#offers" className="partner-nav-link" style={navLink}>광고·제휴 상품</a>
            <a href="#how" className="partner-nav-link" style={navLink}>집행 방식</a>
            <a href="#process" className="partner-nav-link" style={navLink}>진행 절차</a>
            <a href="#price" className="partner-nav-link" style={navLink}>요금</a>
            <a href="#faq" className="partner-nav-link" style={navLink}>자주 묻는 질문</a>
            <a href="#inquiry" style={{ marginLeft: 6, padding: "9px 16px", borderRadius: 999, background: GREEN, color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>문의하기</a>
          </nav>
        </div>
      </header>

      {/* ── 첫 화면 ── */}
      <section style={{ background: "linear-gradient(160deg,#48603A,#5C7A4A 55%,#7b9a66)", color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(48px, 9vw, 92px) 22px clamp(44px, 8vw, 80px)" }}>
          <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.2px" }}>광고·제휴 안내</div>
          <h1 className="ggk-logo" style={{ margin: "18px 0 0", fontSize: "clamp(28px, 6vw, 52px)", fontWeight: 800, lineHeight: 1.26 }}>
            반려동물을 위해 고르는 순간,<br />
            <span style={{ color: "#FFE9A8" }}>먼저 떠오르는 이름으로.</span>
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: "clamp(15px, 2.4vw, 18px)", lineHeight: 1.8, color: "rgba(255,255,255,0.92)", maxWidth: 600, whiteSpace: "pre-line" }}>
            {"같이가개는 반려동물과 함께 사는 보호자가 이용하는 서비스입니다.\n지역 매장부터 사료·간식·용품 브랜드까지,\n필요한 보호자에게 정확히 전달합니다."}
          </p>
          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="#inquiry" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 999, background: "#FFE9A8", color: "#3b3215", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
              광고·제휴 문의 <ArrowRight size={17} />
            </a>
            <a href="#offers" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.55)", color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              상품 안내 보기
            </a>
          </div>
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, maxWidth: 640 }}>
            {[["3.2만+", "등록 장소"], ["1.7만+", "전국 도시공원"], ["매일", "보호소 공고 갱신"]].map(([value, label]) => (
              <div key={label} style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.13)" }}>
                <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>2026년 10월 기준 · 서비스가 제공하는 장소·공고 규모</div>
        </div>
      </section>

      {/* ── 이용자 특성 ── */}
      <section style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0" }}>
        <div style={eyebrow}>이용자 특성</div>
        <h2 className="ggk-logo" style={h2}>{"방문·구매 의사가 분명한\n반려 가구가 이용합니다."}</h2>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {AUDIENCE.map((a) => (
            <div key={a.title} style={{ padding: "22px 20px", borderRadius: 20, background: "white", border: "1px solid #ece6d6" }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center" }}><a.Icon size={20} color="#48603A" /></div>
              <div className="ggk-logo" style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>{a.title}</div>
              <div style={{ ...body(14), marginTop: 8 }}>{a.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 광고·제휴 상품 ── */}
      <section id="offers" style={{ ...wrap, padding: "clamp(44px, 7vw, 76px) 22px 8px", scrollMarginTop: 60 }}>
        <div style={eyebrow}>광고·제휴 상품</div>
        <h2 className="ggk-logo" style={{ ...h2, marginBottom: "clamp(28px, 5vw, 44px)" }}>{"목적에 맞는 방식을 선택하세요."}</h2>
        {OFFERS.map((f, i) => (
          <div key={f.no} style={{ display: "flex", gap: "clamp(16px, 4vw, 44px)", alignItems: "center", flexWrap: "wrap", flexDirection: i % 2 ? "row-reverse" : "row", marginBottom: "clamp(36px, 6vw, 64px)" }}>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: f.color }}>{f.no} · {f.name}</div>
              <h3 className="ggk-logo" style={{ ...h2, fontSize: "clamp(20px, 3.2vw, 28px)" }}>{f.title}</h3>
              <p style={{ ...body(15), margin: "14px 0 0" }}>{f.text}</p>
              <div style={{ marginTop: 14, fontSize: 12.5, color: "#8a8f80" }}>대상 <b style={{ color: "#59624f", marginLeft: 4 }}>{f.who}</b></div>
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

      {/* ── 배너 집행 방식 ── */}
      <section id="how" style={{ background: "white", borderTop: "1px solid #ece6d6", borderBottom: "1px solid #ece6d6", scrollMarginTop: 58 }}>
        <div style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px" }}>
          <div style={eyebrow}>지역 배너 집행 방식</div>
          <h2 className="ggk-logo" style={h2}>{"가까운 이용자에게,\n모든 매장을 동일하게 노출합니다."}</h2>
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {HOW.map((s, i) => (
              <div key={s.title} style={{ padding: "22px 20px", borderRadius: 20, background: BEIGE, border: "1px solid #ece6d6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ggk-logo" style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>0{i + 1}</span>
                  <s.Icon size={18} color={GREEN} />
                </div>
                <div className="ggk-logo" style={{ marginTop: 10, fontSize: 17, fontWeight: 800 }}>{s.title}</div>
                <div style={{ ...body(14), marginTop: 8 }}>{s.text}</div>
              </div>
            ))}
          </div>
          <div style={{ ...body(12.5), marginTop: 16, color: "#8a8f80" }}>{"게재 위치: 커뮤니티·마이페이지 (PC는 화면 양옆, 휴대폰은 화면 상단)\n브랜드 협업의 노출 방식은 상담 단계에서 별도로 협의합니다."}</div>
        </div>
      </section>

      {/* ── 진행 절차 ── */}
      <section id="process" style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0", scrollMarginTop: 60 }}>
        <div style={eyebrow}>진행 절차</div>
        <h2 className="ggk-logo" style={h2}>{"문의 접수부터 결과 보고까지"}</h2>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          {STEPS.map((s) => (
            <div key={s.no} style={{ padding: "20px 18px", borderRadius: 18, background: "white", border: "1px solid #ece6d6" }}>
              <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#c9d6bd" }}>{s.no}</div>
              <div className="ggk-logo" style={{ marginTop: 6, fontSize: 16.5, fontWeight: 800 }}>{s.title}</div>
              <div style={{ ...body(13.5), marginTop: 7 }}>{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 요금 ── */}
      <section id="price" style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0", scrollMarginTop: 60 }}>
        <div style={{ borderRadius: 28, background: "#FFF8E6", border: "1px solid #F3DFA6", padding: "clamp(22px, 5vw, 40px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "#F59E0B", color: "white", fontSize: 12.5, fontWeight: 800 }}><Store size={13} /> 매장 요금제</div>
          <h2 className="ggk-logo" style={{ ...h2, color: "#5b3d05", marginTop: 12 }}>{"첫 달 무료로 시작할 수 있습니다."}</h2>
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {["첫 달 무료 · 2~3개월째 50% 할인 · 4개월째부터 정가", "의무 이용 기간과 해지 위약금 없음", "자동 결제 없음 (연장은 매번 신청)", "현재 시범 운영 요금이며, 변경 시 사전에 안내합니다"].map((line) => (
              <li key={line} style={{ fontSize: 14.5, lineHeight: 1.7, color: "#7a5a17", paddingLeft: 16, position: "relative" }}><span style={{ position: "absolute", left: 0, color: "#D4A24C", fontWeight: 800 }}>·</span>{line}</li>
            ))}
          </ul>
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {paidPlans.map((plan) => (
              <div key={plan.id} style={{ padding: "18px 18px", borderRadius: 18, background: "white", border: `1px solid ${plan.id === "local" ? "#E9B949" : "#F3DFA6"}` }}>
                <div className="ggk-logo" style={{ fontSize: 16.5, fontWeight: 800, color: "#5b3d05" }}>{plan.name}</div>
                <div style={{ fontSize: 12.5, color: "#8a6a25", marginTop: 3, lineHeight: 1.5 }}>{plan.tagline}</div>
                <div className="ggk-logo" style={{ marginTop: 10, fontSize: 21, fontWeight: 800, color: "#B45309" }}>월 {won(plan.monthlyPrice)}</div>
                <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
                  {plan.features.map((feature) => <li key={feature} style={{ fontSize: 12.5, lineHeight: 1.6, color: "#6b5a2e", paddingLeft: 12, position: "relative" }}><span style={{ position: "absolute", left: 0, color: "#D4A24C" }}>·</span>{feature}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ ...body(12.5), marginTop: 16, color: "#8a6a25" }}>{"부가세 포함 정가입니다.\n브랜드 협업과 기관·서비스 제휴 비용은 범위에 따라 달라 문의 시 별도로 안내드립니다."}</div>
          <Link href="/signup-owner" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 20px", borderRadius: 999, background: "#B45309", color: "white", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>
            매장 등록(사장님 가입) <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── 광고 운영 정책 ── */}
      <section style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0" }}>
        <div style={eyebrow}>광고 운영 정책</div>
        <h2 className="ggk-logo" style={h2}>{"이용자의 신뢰를 기준으로\n광고를 운영합니다."}</h2>
        <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
          {RULES.map((r) => (
            <div key={r.title} style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "16px 18px", borderRadius: 16, background: "white", border: "1px solid #ece6d6" }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.Icon size={18} color="#48603A" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{r.title}</div>
                <div style={{ ...body(13.5), marginTop: 4 }}>{r.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 자주 묻는 질문 ── */}
      <section id="faq" style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0", scrollMarginTop: 60 }}>
        <div style={eyebrow}>FAQ</div>
        <h2 className="ggk-logo" style={h2}>자주 묻는 질문</h2>
        <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
          {FAQ.map((item) => (
            <details key={item.q} style={{ borderRadius: 16, background: "white", border: "1px solid #ece6d6", padding: "15px 18px" }}>
              <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 800, lineHeight: 1.5 }}>{item.q}</summary>
              <div style={{ ...body(14), marginTop: 10 }}>{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── 문의 양식 ── */}
      <section style={{ ...wrap, maxWidth: 760, padding: "clamp(40px, 7vw, 68px) 22px var(--ggk-tabbar-space)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, ...eyebrow }}><MessageSquareText size={15} />광고·제휴 문의</div>
          <h2 className="ggk-logo" style={h2}>문의 접수</h2>
          <p style={{ ...body(14), margin: "10px 0 0" }}>{"구체적인 계획이 정해지지 않아도 괜찮습니다.\n홍보 대상(매장·브랜드·상품)을 기재해 주시면\n적합한 방식을 제안드립니다."}</p>
        </div>
        <PartnershipForm />
        <div style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: "#9aa191" }}>© 2026 같이가개</div>
      </section>
    </div>
  );
}
