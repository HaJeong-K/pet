import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Bell, CalendarCheck, ClipboardList, FileText, ShieldCheck, ShoppingBag, Store, Utensils } from "lucide-react";
import StorePartnerForm from "./StorePartnerForm";

// 카페·식당·수제 간식 가게 사장님용 쇼핑 입점 안내(/partner/store?place=번호) — 서비스 소개(/about)·숙소 입점 안내와 같은 구성:
//   위에 붙는 머리 줄 → 화면 전체 폭 첫 화면 → 같이가개에 입점하면(번호 붙은 4가지) → 진행 절차 → 주요 입점 조건
//   → 자주 묻는 질문 → 입점 상담 신청 → 마지막 띠
// 장소 상세의 "이 가게 사장님이신가요?"에서 들어옵니다. 신청은 StorePartnerForm(/api/owner/store-partner).
// 쇼핑 수수료는 아직 정하지 않아 숫자를 적지 않습니다.

export const metadata: Metadata = {
  title: "쇼핑 입점 안내 | 같이가개",
  description: "카페·식당·수제 간식 가게의 포장 주문과 매장 식사 예약을 같이가개에서 받아 보십시오.",
};

const DARK = "#2F3B28", GREEN = "#5C7A4A", GOLD = "#F3DA9B", BEIGE = "#F7F3E8", SUB = "#5f6656";
const wrap: React.CSSProperties = { width: "100%", maxWidth: 1120, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
const navLink: React.CSSProperties = { padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#48603A", textDecoration: "none", whiteSpace: "nowrap" };
const h2: React.CSSProperties = { margin: "8px 0 0", fontSize: "clamp(24px, 3.6vw, 34px)", fontWeight: 800, lineHeight: 1.32, letterSpacing: "-0.5px" };
const eyebrow: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: GREEN, letterSpacing: "0.2px" };
const goldButton: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 24px", borderRadius: 999, background: GOLD, color: DARK, fontSize: 15.5, fontWeight: 800, textDecoration: "none" };

const POINTS = [
  {
    no: "01", Icon: Store, tone: "#E4EBDC", color: "#48603A",
    title: ["반려동물과 함께 올 손님을", "미리 만납니다."],
    text: "같이가개 이용자는 처음부터 반려동물 동반 장소를 찾고 있습니다. 지도와 장소 화면, 쇼핑 탭에서 우리 가게를 보여 드립니다.",
    chips: ["지도·장소 화면 안내", "쇼핑 탭 진열", "입점 가게 표시"],
  },
  {
    no: "02", Icon: ShoppingBag, tone: "#FDEBDD", color: "#B4532A",
    title: ["포장 주문을", "시간에 맞춰 준비합니다."],
    text: "손님이 메뉴와 수량, 가지러 올 시간을 정해 주문합니다. 사장님은 확인한 뒤 시간에 맞춰 준비하면 됩니다.",
    chips: ["메뉴·가격 직접 등록", "가지러 올 시간", "요청 사항"],
  },
  {
    no: "03", Icon: Utensils, tone: "#E3EDFA", color: "#1D4F91",
    title: ["매장 식사 예약으로", "자리와 메뉴를 준비합니다."],
    text: "방문 인원과 시간, 메뉴를 미리 받습니다. 포장과 매장 식사 중 가게에 맞는 방식만 골라 운영할 수 있습니다.",
    chips: ["방문 인원", "방문 시간", "받을 방식 선택"],
  },
  {
    no: "04", Icon: ClipboardList, tone: "#FFF3DF", color: "#7A4A26",
    title: ["주문과 후기를", "사장님 센터에서 관리합니다."],
    text: "확정·준비 완료·이용 완료·노쇼 처리와 취소 요청 답변, 후기 답글을 한 화면에서 처리합니다. 새 주문은 알림으로 받습니다.",
    chips: ["주문 상태 관리", "취소 요청 답변", "후기 답글"],
  },
];

const STEPS = [
  { Icon: BadgeCheck, title: "사장님 가입", text: "사장님으로 가입하고 사업자 인증을 진행합니다." },
  { Icon: FileText, title: "입점 상담 신청", text: "가게 정보와 받을 방식을 적어 상담을 신청합니다." },
  { Icon: CalendarCheck, title: "상담·승인", text: "같이가개가 연락드려 조건을 안내하고 입점을 승인합니다." },
  { Icon: Bell, title: "메뉴 등록 후 주문 받기", text: "메뉴를 올리면 쇼핑 탭에 진열되고 주문을 받습니다." },
];

const TERMS = [
  "대상: 카페·식당·디저트·반려동물 수제 간식·용품 가게입니다. 공원·병원·약국·미용·숙소는 대상이 아닙니다(숙소는 숙소 입점을 이용해 주십시오).",
  "결제: 손님이 주문할 때 미리 결제하는 방식으로 운영합니다. 카드 결제 연결 전까지는 주문만 접수하며, 일정은 상담 때 안내합니다.",
  "확정 전 취소: 가게가 확정하기 전에는 손님이 바로 취소할 수 있고, 전액 환불됩니다. 가게가 거절해도 전액 환불됩니다.",
  "확정 후 취소: 손님이 취소를 요청하고, 사장님이 받아 주면 전액 환불됩니다.",
  "노쇼: 약속 시간에 오지 않은 주문을 노쇼로 처리하면 환불하지 않습니다.",
  "자동 처리: 12시간 안에 확인하지 않았거나 약속 시간이 지난 주문은 자동 취소되고 전액 환불됩니다. 확정한 주문은 약속 시간 24시간 뒤 자동으로 이용 완료됩니다.",
  "수수료·요금: 상담할 때 안내해 드립니다.",
];

const FAQ = [
  { q: "포장만, 또는 매장 식사만 받을 수 있나요?", a: "네. 상담을 신청할 때 받을 방식을 고르며, 입점한 뒤에도 바꿀 수 있습니다." },
  { q: "수수료는 얼마인가요?", a: "입점 상담 때 안내해 드립니다." },
  { q: "지도에 우리 가게가 없습니다.", a: "상담 신청서에 가게 이름과 주소를 적어 주십시오. 상담 과정에서 지도 등록을 함께 안내해 드립니다." },
  { q: "사업자 인증이 끝나기 전에도 신청할 수 있나요?", a: "신청할 수 있습니다. 다만 입점 승인은 사장님 인증이 끝난 뒤에 진행됩니다." },
  { q: "주문을 제때 확인하지 못하면 어떻게 되나요?", a: "12시간이 지나거나 약속 시간이 지나면 자동으로 취소되고 손님에게 전액 환불됩니다. 새 주문은 알림으로 보내 드립니다." },
  { q: "후기는 누가 남길 수 있나요?", a: "주문하고 이용을 마친 손님만 30일 안에 남길 수 있습니다. 사장님이 답글을 달 수 있고, 문제가 있는 후기는 신고할 수 있습니다." },
];

export default function PartnerStorePage() {
  return (
    // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: BEIGE, color: "#1f1a12", wordBreak: "keep-all" }}>
      {/* ── 상단 ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(247,243,232,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #e8e2d2" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, height: 60 }}>
          <Link href="/" aria-label="같이가개 지도" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ objectFit: "contain", height: 36, width: "auto" }} priority />
          </Link>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: GREEN, padding: "4px 10px", borderRadius: 999, background: "#E4EBDC", whiteSpace: "nowrap" }}>쇼핑 입점</span>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <style>{`@media (max-width: 720px) { .partner-nav-link { display: none; } }`}</style>
            <a href="#benefits" className="partner-nav-link" style={navLink}>입점 혜택</a>
            <a href="#steps" className="partner-nav-link" style={navLink}>진행 절차</a>
            <a href="#terms" className="partner-nav-link" style={navLink}>입점 조건</a>
            <a href="#faq" className="partner-nav-link" style={navLink}>자주 묻는 질문</a>
            <a href="#apply" style={{ marginLeft: 6, padding: "9px 16px", borderRadius: 999, background: DARK, color: "white", fontSize: 13, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>상담 신청</a>
          </nav>
        </div>
      </header>

      {/* ── 첫 화면 ── */}
      <section style={{ background: "linear-gradient(160deg,#1F2A1A 0%,#2F3B28 50%,#4A6339 100%)", color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(52px, 9vw, 104px) 24px clamp(48px, 8vw, 88px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 12.5, fontWeight: 700 }}>
            <ShoppingBag size={13} />카페·식당·수제 간식 가게 입점 안내
          </div>
          <h1 className="ggk-logo" style={{ margin: "18px 0 0", fontSize: "clamp(32px, 6.4vw, 58px)", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-1px" }}>
            반려동물과 함께 오는 손님을,<br />
            <span style={{ color: GOLD }}>우리 가게로.</span>
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: "clamp(15px, 2.2vw, 18px)", lineHeight: 1.75, color: "rgba(255,255,255,0.86)", maxWidth: 600 }}>
            포장 주문과 매장 식사 예약을 같이가개에서 받아 보십시오.<br />
            같이가개에 가입한 사장님이면 누구나 입점 상담을 받을 수 있습니다.
          </p>
          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <a href="#apply" style={{ ...goldButton, boxShadow: "0 10px 26px rgba(0,0,0,0.25)" }}>입점 상담 신청하기 <ArrowRight size={17} /></a>
            <a href="#terms" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.45)", color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              입점 조건 보기
            </a>
          </div>
          <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, maxWidth: 760 }}>
            {[["포장 주문", "시간에 맞춰 준비"], ["매장 식사", "인원·시간 미리 확인"], ["주문 관리", "사장님 센터에서 한 번에"]].map(([value, label]) => (
              <div key={value} style={{ padding: "16px 18px", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 800, color: GOLD }}>{value}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 같이가개에 입점하면 ── */}
      <section id="benefits" style={{ ...wrap, padding: "clamp(44px, 7vw, 80px) 24px 8px", scrollMarginTop: 64 }}>
        <div style={eyebrow}>같이가개에 입점하면</div>
        <h2 className="ggk-logo" style={{ ...h2, marginBottom: "clamp(28px, 5vw, 48px)" }}>준비된 상태로 손님을 맞이합니다.</h2>
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
          <h2 className="ggk-logo" style={h2}>가입부터 첫 주문까지, 네 단계.</h2>
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
        </div>
      </section>

      {/* ── 주요 입점 조건 ── */}
      <section id="terms" style={{ ...wrap, padding: "clamp(44px, 7vw, 72px) 24px", scrollMarginTop: 64 }}>
        <div style={{ display: "flex", gap: "clamp(20px, 4vw, 48px)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={eyebrow}>주요 입점 조건</div>
            <h2 className="ggk-logo" style={h2}>미리 확인해 주십시오.</h2>
            <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.8, color: SUB }}>
              자세한 내용은 입점 상담 때<br />함께 안내해 드립니다.
            </p>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: GREEN, fontWeight: 700 }}>
              <ShieldCheck size={16} />노쇼는 환불 없이 처리합니다
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

      {/* ── 입점 상담 신청 ── */}
      <section id="apply" style={{ background: "white", borderTop: "1px solid #ece6d6", scrollMarginTop: 64 }}>
        <div style={{ ...wrap, maxWidth: 680, padding: "clamp(44px, 7vw, 72px) 24px" }}>
          <div style={eyebrow}>입점 상담 신청</div>
          <h2 className="ggk-logo" style={{ ...h2, marginBottom: 20 }}>가게 정보를 남겨 주십시오.</h2>
          <Suspense fallback={null}><StorePartnerForm /></Suspense>
        </div>
      </section>

      {/* ── 마지막 띠 ── */}
      <section style={{ background: DARK, color: "white" }}>
        <div style={{ ...wrap, padding: "clamp(48px, 8vw, 84px) 24px calc(clamp(48px, 8vw, 84px) + var(--ggk-tabbar-space))", textAlign: "center" }}>
          <h2 className="ggk-logo" style={{ margin: 0, fontSize: "clamp(26px, 4.4vw, 40px)", fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.5px" }}>
            반려동물 손님을 맞을 준비,<br /><span style={{ color: GOLD }}>오늘 시작해 보십시오.</span>
          </h2>
          <div style={{ marginTop: 26 }}><a href="#apply" style={goldButton}>입점 상담 신청하기 <ArrowRight size={17} /></a></div>
          <div style={{ marginTop: 22, fontSize: 12, color: "rgba(255,255,255,0.88)", lineHeight: 1.8 }}>
            숙소를 운영하고 계시면 <a href="/partner/lodging" style={{ color: GOLD, fontWeight: 700 }}>숙소 입점 안내</a>를 확인해 주십시오.
          </div>
        </div>
      </section>
    </div>
  );
}
