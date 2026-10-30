import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BadgeCheck, BedDouble, CalendarCheck, CalendarSync, Coffee, FileText, MapPin, PawPrint, ShieldCheck, Wallet,
} from "lucide-react";
import PartnerStartButton from "./PartnerStartButton";
import {
  AUTO_CONFIRM_DAYS, BASIC_FEE_RATE, CANCEL_FEE_RATE, LODGING_CONTRACT_VERSION, PREMIUM_FEE_RATE, PROMO_FEE_RATE, PROMO_MONTHS,
} from "@/lib/lodgingPolicy";

// 숙소 사장님용 입점 안내(/partner/lodging) — 서비스 소개(/about)와 같은 구성:
//   위에 붙는 머리 줄 → 화면 전체 폭 첫 화면(한 줄 소개·입점 프로모션) → 같이가개에 입점하면(번호 붙은 4가지)
//   → 진행 절차 → 주요 입점 조건 → 자주 묻는 질문 → 마지막 띠(입점 신청하기)
// 숙소 상세의 "이 숙소 사장님이신가요?"에서 ?place=번호 로 들어오면 입점 신청에서 그 숙소를 미리 골라 둡니다(PartnerStartButton).
// 수수료 숫자는 src/lib/lodgingPolicy.ts에서 그대로 가져옵니다(계약서와 같은 값). "업계 최저" 같은 비교 표현은 쓰지 않습니다.

export const metadata: Metadata = {
  title: "숙소 입점 안내 | 같이가개",
  description: "반려동물과 여행하는 손님만 모이는 숙소 예약 서비스, 같이가개에 숙소를 입점해 보세요.",
};

const DARK = "#2F3B28", GREEN = "#5C7A4A", GOLD = "#F3DA9B", BEIGE = "#F7F3E8", SUB = "#5f6656";
const wrap: React.CSSProperties = { width: "100%", maxWidth: 1120, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
const navLink: React.CSSProperties = { padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#48603A", textDecoration: "none", whiteSpace: "nowrap" };
const h2: React.CSSProperties = { margin: "8px 0 0", fontSize: "clamp(24px, 3.6vw, 34px)", fontWeight: 800, lineHeight: 1.32, letterSpacing: "-0.5px" };
const eyebrow: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: GREEN, letterSpacing: "0.2px" };

const POINTS = [
  {
    no: "01", Icon: PawPrint, tone: "#E4EBDC", color: "#48603A",
    title: ["반려동물과 여행하는", "손님만 모여요."],
    text: "같이가개 손님은 처음부터 반려동물 동반 숙소를 찾고 있어요. 동반 여부를 다시 묻는 전화가 줄어들어요.",
    chips: ["동반 숙소만 찾는 손님", "숙소 탭 바로 예약", "내 주변·지역 검색"],
  },
  {
    no: "02", Icon: Coffee, tone: "#FDEBDD", color: "#B4532A",
    title: ["숙소 근처 즐길 거리까지", "한 번에 보여 줘요."],
    text: "숙소 화면에서 근처 동반 카페·식당·공원과 산책 코스를 함께 보여 줘서, 손님이 머무는 동안 갈 곳을 바로 찾아요.",
    chips: ["근처 동반 장소", "산책 코스", "지도에서 보기"],
  },
  {
    no: "03", Icon: ShieldCheck, tone: "#E3EDFA", color: "#1D4F91",
    title: ["동반 조건을 미리,", "정확하게 알려요."],
    text: "크기·몸무게·마릿수·추가 요금은 물론 접종 증명, 동물등록, 나이, 체고, 객실 이용 규칙까지 같은 기준으로 보여 줘요. 손님이 항목마다 확인하고 예약해서 현장 다툼이 줄어들어요.",
    chips: ["입실 체크리스트", "접종·동물등록 확인", "크기별 추가 요금", "견종 선택"],
  },
  {
    no: "04", Icon: Wallet, tone: "#FFF3DF", color: "#7A4A26",
    title: ["가입비·광고비 없이", "이용 확정된 예약만 수수료."],
    text: "쿠폰·광고 비용을 따로 받지 않아요. 요일별 요금·부가 옵션(바비큐 등)도 직접 정하고, 성과 보고서로 효과를 확인해요.",
    chips: ["요일별 요금", "부가 옵션", "성과 보고서"],
  },
];

const STEPS = [
  { Icon: BadgeCheck, title: "사장님 가입·인증", text: "사업자등록번호로 숙소 사장님 인증을 받아요." },
  { Icon: FileText, title: "입점 신청", text: "숙소 선택, 숙박업 영업신고증, 정산 계좌, 계약 동의" },
  { Icon: BedDouble, title: "객실·동반 규정 등록", text: "객실 사진 2장 이상, 요금, 동반 조건을 올려요." },
  { Icon: CalendarCheck, title: "승인 후 예약 받기", text: "보통 1~2영업일 안에 확인하고, 승인일이 입점일이 돼요." },
];

const TERMS = [
  `수수료: 입점일부터 ${PROMO_MONTHS}개월 동안 체크인하는 예약은 ${PROMO_FEE_RATE}%, 이후 ${BASIC_FEE_RATE}%입니다. 숙소 프리미엄 이용 기간에는 ${PREMIUM_FEE_RATE}%입니다.`,
  "결제: 손님은 예약할 때 전액을 결제하고, 같이가개가 이용 확정 때까지 보관합니다.",
  "추가 요금: 인원·반려동물 추가 요금과 부가 옵션까지 예약할 때 함께 결제돼요. 현장에서 추가 요금을 받을 수 없어요.",
  `이용 확정: 체크아웃 날부터 손님이 '이용 확정'을 누를 수 있고, ${AUTO_CONFIRM_DAYS}일 안에 누르지 않으면 자동으로 확정됩니다.`,
  "정산: 이용 확정 다음 영업일에 수수료를 뺀 금액을 등록한 계좌로 보내 드립니다.",
  `취소·환불: 공정거래위원회 소비자분쟁해결기준(숙박업)을 따릅니다. 손님 사정 취소의 위약금은 숙소 몫이며, 위약금에서 취소 정산 수수료 ${CANCEL_FEE_RATE}%를 뺀 금액을 정산합니다.`,
  "숙소 사정 취소: 손님에게 전액 환불하고 기준에 따른 배상금을 드리며, 배상금은 다음 정산에서 뺍니다.",
  "동반 조건 준수: 등록한 동반 조건에 맞는 손님의 입실을 거부하면 숙소 사정 취소와 같이 처리합니다.",
  "손님 규정 위반: 입실 거부·퇴실 요청 전에 사장님 센터에서 같이가개에 접수합니다. 파손·오염은 체크아웃 후 14일 안에 증빙과 함께 접수하며, 실제 손해 범위에서 배상받습니다. 정액 벌금이나 현장 청구는 받을 수 없습니다.",
  "조건 변경: 계약 조건을 바꿀 때는 30일 전에 알려 드리며, 동의하지 않으면 위약금 없이 해지할 수 있습니다.",
];

const FAQ = [
  { q: "다른 예약 사이트에도 객실을 팔고 있어요. 중복 예약이 나지 않을까요?", a: "객실마다 '달력 연동'으로 다른 사이트(에어비앤비·부킹닷컴 등)의 달력 주소를 넣으면, 그쪽에서 팔린 날이 같이가개에서 자동으로 막혀요. 같이가개 예약도 달력 주소로 내보내 그쪽에서 막을 수 있어요. 달력 주소를 주지 않는 사이트는 사장님 센터에서 날짜를 직접 막아 주세요." },
  { q: "수수료는 언제, 어떻게 빠지나요?", a: `이용 확정된 예약에서만 빠지고, 정산할 때 수수료를 뺀 금액을 보내 드려요. 입점일부터 ${PROMO_MONTHS}개월 동안 체크인하는 예약은 ${PROMO_FEE_RATE}%예요.` },
  { q: "예약은 바로 확정되나요?", a: "기본은 사장님이 24시간 안에 확정하거나 거절해요. '즉시 확정'을 켜면 손님 결제와 함께 바로 확정돼요." },
  { q: "지도에 우리 숙소가 없어요.", a: "입점 신청할 때 숙소 이름·주소를 직접 적으면 돼요. 같이가개가 확인한 뒤 지도에 등록해 드려요." },
  { q: "후기는 어떻게 관리하나요?", a: "같이가개에서 예약하고 이용한 손님만 별점 후기를 남길 수 있어요. 사장님 답글을 달 수 있고, 사실과 다르거나 악의적인 후기는 신고하면 관리자가 검토해요." },
];

export default function PartnerLodgingPage() {
  return (
    // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: BEIGE, color: "#1f1a12", wordBreak: "keep-all" }}>
      {/* ── 상단 ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(247,243,232,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #e8e2d2" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, height: 60 }}>
          <Link href="/" aria-label="같이가개 지도" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ objectFit: "contain", height: 36, width: "auto" }} priority />
          </Link>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: GREEN, padding: "4px 10px", borderRadius: 999, background: "#E4EBDC" }}>숙소 입점</span>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <style>{`@media (max-width: 720px) { .partner-nav-link { display: none; } }`}</style>
            <a href="#benefits" className="partner-nav-link" style={navLink}>입점 혜택</a>
            <a href="#steps" className="partner-nav-link" style={navLink}>진행 절차</a>
            <a href="#terms" className="partner-nav-link" style={navLink}>입점 조건</a>
            <a href="#faq" className="partner-nav-link" style={navLink}>자주 묻는 질문</a>
            <span style={{ marginLeft: 6 }}><Suspense fallback={null}><PartnerStartButton variant="nav" /></Suspense></span>
          </nav>
        </div>
      </header>

      {/* ── 첫 화면 ── */}
      <section style={{ background: "linear-gradient(160deg,#1F2A1A 0%,#2F3B28 50%,#4A6339 100%)", color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(52px, 9vw, 104px) 24px clamp(48px, 8vw, 88px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 12.5, fontWeight: 700 }}>
            <BedDouble size={13} />숙소 사장님 입점 안내
          </div>
          <h1 className="ggk-logo" style={{ margin: "18px 0 0", fontSize: "clamp(32px, 6.4vw, 58px)", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-1px" }}>
            반려동물과 여행하는 손님을,<br />
            <span style={{ color: GOLD }}>우리 숙소로.</span>
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: "clamp(15px, 2.2vw, 18px)", lineHeight: 1.75, color: "rgba(255,255,255,0.86)", maxWidth: 600 }}>
            같이가개는 반려동물 동반 장소 지도에서 시작한<br />
            반려동물 전문 숙소 예약 서비스입니다.
          </p>
          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Suspense fallback={null}><PartnerStartButton variant="hero" /></Suspense>
            <a href="#terms" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.45)", color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              입점 조건 보기
            </a>
          </div>
          <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, maxWidth: 760 }}>
            {[[`${PROMO_FEE_RATE}%`, `입점일부터 ${PROMO_MONTHS}개월 수수료`], [`${BASIC_FEE_RATE}%`, `이후 기본 · 프리미엄 ${PREMIUM_FEE_RATE}%`], ["0원", "가입비 · 광고비"]].map(([value, label]) => (
              <div key={label} style={{ padding: "16px 18px", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <div className="ggk-logo" style={{ fontSize: 28, fontWeight: 800, color: GOLD }}>{value}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 같이가개에 입점하면 ── */}
      <section id="benefits" style={{ ...wrap, padding: "clamp(44px, 7vw, 80px) 24px 8px", scrollMarginTop: 64 }}>
        <div style={eyebrow}>같이가개에 입점하면</div>
        <h2 className="ggk-logo" style={{ ...h2, marginBottom: "clamp(28px, 5vw, 48px)" }}>손님이 먼저 찾아오는 숙소가 돼요.</h2>
        {POINTS.map((f, i) => (
          <div key={f.no} style={{ display: "flex", gap: "clamp(16px, 4vw, 52px)", alignItems: "center", flexWrap: "wrap", flexDirection: i % 2 ? "row-reverse" : "row", marginBottom: "clamp(36px, 6vw, 68px)" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: f.color }}>{f.no}</div>
              <h3 className="ggk-logo" style={{ margin: "8px 0 0", fontSize: "clamp(22px, 3.2vw, 30px)", fontWeight: 800, lineHeight: 1.34, letterSpacing: "-0.4px" }}>
                {f.title[0]}<br />{f.title[1]}
              </h3>
              <p style={{ margin: "12px 0 0", fontSize: 15.5, lineHeight: 1.8, color: SUB }}>{f.text}</p>
            </div>
            <div style={{ flex: "1 1 320px", minWidth: 0, borderRadius: 28, background: f.tone, padding: "clamp(24px, 4vw, 40px)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.07)" }}>
                <f.Icon size={26} color={f.color} />
              </div>
              <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {f.chips.map((c) => (
                  <span key={c} style={{ padding: "9px 14px", borderRadius: 999, background: "white", color: f.color, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── 진행 절차 ── */}
      <section id="steps" style={{ background: "white", borderTop: "1px solid #ece6d6", borderBottom: "1px solid #ece6d6", scrollMarginTop: 64 }}>
        <div style={{ ...wrap, padding: "clamp(44px, 7vw, 72px) 24px" }}>
          <div style={eyebrow}>진행 절차</div>
          <h2 className="ggk-logo" style={h2}>가입부터 첫 예약까지, 네 단계.</h2>
          <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ padding: "24px 22px", borderRadius: 22, background: BEIGE, border: "1px solid #ece6d6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 999, background: DARK, color: "white", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <s.Icon size={19} color={GREEN} />
                </div>
                <div className="ggk-logo" style={{ marginTop: 14, fontSize: 18, fontWeight: 800 }}>{s.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7, color: SUB }}>{s.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 16, fontSize: 13, color: "#655d4f", lineHeight: 1.7 }}>
            <MapPin size={14} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>지도에 아직 없는 숙소도 신청할 수 있어요. 같이가개가 확인한 뒤 지도에 등록해 드려요.</span>
          </div>
        </div>
      </section>

      {/* ── 주요 입점 조건 ── */}
      <section id="terms" style={{ ...wrap, padding: "clamp(44px, 7vw, 72px) 24px", scrollMarginTop: 64 }}>
        <div style={{ display: "flex", gap: "clamp(20px, 4vw, 48px)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={eyebrow}>주요 입점 조건</div>
            <h2 className="ggk-logo" style={h2}>숫자는 계약서와<br />똑같이 적었어요.</h2>
            <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.8, color: SUB }}>
              같이가개 숙소 입점 계약서 {LODGING_CONTRACT_VERSION}판 기준이에요.<br />전문은 입점 신청 때 함께 안내해 드려요.
            </p>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: GREEN, fontWeight: 700 }}>
              <CalendarSync size={16} />달력 연동으로 다른 사이트와 중복 예약 방지
            </div>
          </div>
          <ol style={{ flex: "2 1 460px", margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {TERMS.map((t, i) => (
              <li key={t} style={{ display: "flex", gap: 14, padding: "16px 18px", borderRadius: 18, background: "white", border: "1px solid #ece6d6", fontSize: 14.5, lineHeight: 1.75, color: "#3a3a32" }}>
                <span className="ggk-logo" style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: GREEN, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 자주 묻는 질문 ── */}
      <section id="faq" style={{ ...wrap, padding: "0 24px clamp(44px, 7vw, 72px)", scrollMarginTop: 64 }}>
        <div style={eyebrow}>FAQ</div>
        <h2 className="ggk-logo" style={{ ...h2, marginBottom: 18 }}>먼저 궁금한 것들.</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {FAQ.map((item) => (
            <details key={item.q} style={{ borderRadius: 18, background: "white", border: "1px solid #ece6d6", padding: "0 20px" }}>
              <summary style={{ cursor: "pointer", padding: "18px 0", fontSize: 15.5, fontWeight: 700, listStyle: "none" }}>{item.q}</summary>
              <div style={{ padding: "0 0 18px", fontSize: 14.5, lineHeight: 1.8, color: SUB }}>{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── 마지막 띠 ── */}
      <section style={{ background: DARK, color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(48px, 8vw, 84px) 24px calc(clamp(48px, 8vw, 84px) + var(--ggk-tabbar-space))", textAlign: "center" }}>
          <h2 className="ggk-logo" style={{ margin: 0, fontSize: "clamp(26px, 4.4vw, 40px)", fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.5px" }}>
            반려동물 손님을 맞을 준비,<br /><span style={{ color: GOLD }}>오늘 시작해 보세요.</span>
          </h2>
          <div style={{ marginTop: 26 }}><Suspense fallback={null}><PartnerStartButton variant="dark" /></Suspense></div>
          <div style={{ marginTop: 22, fontSize: 12, color: "rgba(255,255,255,0.88)", lineHeight: 1.8 }}>
            가입비·광고비 없음 · 이용 확정된 예약에만 수수료<br />
            같이가개는 통신판매중개자이며 숙박 계약의 당사자는 숙소입니다.
          </div>
        </div>
      </section>
    </div>
  );
}
