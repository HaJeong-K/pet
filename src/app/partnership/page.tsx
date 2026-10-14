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
// 사이트 아래의 "광고·제휴 문의"에서 들어옵니다. 서비스 소개(/about)와 같은 결의 화면으로,
// 누가 보는지 → 무엇을 할 수 있는지 → 광고가 어떻게 나가는지 → 진행 순서 → 요금 → 지키는 원칙 → 자주 묻는 질문 → 문의 양식 순서입니다.
// 대상은 동반 가게만이 아닙니다 — 사료·간식·용품 같은 브랜드 협업, 기관·서비스 제휴도 함께 안내합니다.
// 문의는 관리자 화면(/admin/inquiries)에 쌓이고 관리자에게 바로 알림이 갑니다.
// 숫자는 과장 없이 확인할 수 있는 것만 적습니다(방문자 수처럼 확인되지 않은 수치는 싣지 않음).

const title = "광고·제휴 안내 | 같이가개";
const description = "반려동물과 함께 사는 보호자에게 가게·브랜드·상품을 알리고 싶다면 같이가개에 문의해 주세요. 동네 배너 광고, 사료·간식·용품 브랜드 협업, 기관·서비스 제휴를 안내해 드려요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/partnership` },
  openGraph: { title, description, url: `${siteUrl}/partnership`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

const GREEN = "#5C7A4A", DARK = "#2f3a26", BEIGE = "#F7F3E8";
const wrap: React.CSSProperties = { width: "100%", maxWidth: 1040, margin: "0 auto", padding: "0 22px", boxSizing: "border-box" };
const navLink: React.CSSProperties = { padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, color: "#59624f", textDecoration: "none", whiteSpace: "nowrap" };
const eyebrow: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: GREEN };
const h2: React.CSSProperties = { margin: "8px 0 0", fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 800, lineHeight: 1.32 };

const AUDIENCE = [
  { Icon: Search, title: "찾아보고 고르는 보호자", text: "어디에 갈지, 무엇을 먹일지 꼼꼼히 알아보는 사람이 와요. 광고가 방해가 아니라 참고할 정보가 되는 순간이에요." },
  { Icon: MapIcon, title: "동네에서 움직여요", text: "내 위치 주변을 먼저 보기 때문에, 가까운 가게나 근처에서 살 수 있는 상품일수록 실제 방문·구매로 이어지기 쉬워요." },
  { Icon: Users, title: "다시 오는 사람들", text: "후기·산책 친구·나눔 글, 유기동물 공고를 보러 꾸준히 다시 와요. 한 번 스치는 노출이 아니에요." },
];

const OFFERS = [
  {
    no: "01", Icon: MapPin, tone: "#FFF3DF", color: "#B45309",
    title: ["우리 동네 보호자에게,", "배너로 먼저."],
    text: "가게가 있는 시·군·구의 보호자에게 커뮤니티·마이페이지 배너로 보여요. 문구·사진·글꼴을 사장님이 직접 고르고, 저장하기 전에 실제 모습을 미리 볼 수 있어요.",
    chips: [{ Icon: Type, label: "문구·사진·글꼴 직접" }, { Icon: MapPin, label: "같은 동네 먼저" }, { Icon: Scale, label: "노출 횟수 똑같이" }],
    who: "반려동물 동반 가게·매장 사장님",
  },
  {
    no: "02", Icon: Bone, tone: "#EDE7FE", color: "#5b21b6",
    title: ["사료·간식·용품 브랜드와", "함께 만드는 협업."],
    text: "사료·간식·영양제·용품부터 보험·여행·숙박까지, 반려 가구를 위한 브랜드라면 함께할 방법을 같이 찾아요. 신제품 소개, 체험·샘플 행사, 동네 가게와 함께하는 기획처럼 브랜드에 맞게 정해요.",
    chips: [{ Icon: Megaphone, label: "신제품·브랜드 소개" }, { Icon: Gift, label: "체험·샘플 행사" }, { Icon: Store, label: "동네 가게와 연계" }, { Icon: BarChart3, label: "성과 숫자 공유" }],
    who: "사료·간식·용품 브랜드 · 제조사 · 대행사",
  },
  {
    no: "03", Icon: Handshake, tone: "#E4EBDC", color: "#48603A",
    title: ["함께하면 더 좋은 일,", "제휴로 제안해 주세요."],
    text: "지자체·기관의 반려동물 정책·시설 안내, 지역 행사, 유기동물 입양 홍보, 장소 데이터 연계처럼 보호자에게 도움이 되는 일을 같이 만들어요.",
    chips: [{ Icon: Building2, label: "지자체·기관" }, { Icon: HeartHandshake, label: "입양·보호 캠페인" }, { Icon: PawPrint, label: "데이터·서비스 연계" }],
    who: "지자체 · 기관 · 단체 · 서비스",
  },
];

const HOW = [
  { Icon: MapPin, title: "내 동네 가게부터", text: "보는 사람과 같은 시·군·구에 배너를 낸 가게가 있으면 그 가게들만 보여요." },
  { Icon: MapIcon, title: "없으면 가까운 지역", text: "내 동네에 없을 때는 바로 근처 지역의 가게를, 그다음은 최근에 찾아본 지역의 가게를 보여요." },
  { Icon: Scale, title: "여러 곳이면 똑같이", text: "같은 동네에 가게가 여러 곳이면 모든 가게가 같은 횟수만큼 나가도록 돌아가며 보여요. 돈을 더 낸다고 더 많이 나가지 않아요." },
  { Icon: BarChart3, title: "성과는 숫자로", text: "배너가 보인 횟수와 눌린 횟수를 세어 사장님 화면에서 바로 확인할 수 있어요." },
];

const STEPS = [
  { no: "01", title: "문의 남기기", text: "아래 양식에 알리고 싶은 것과 원하는 지역·기간을 적어 주세요." },
  { no: "02", title: "상담", text: "영업일 기준 2~3일 안에 적어 주신 연락처로 답을 드려요." },
  { no: "03", title: "내용 정하기", text: "노출 방식·기간·요금을 함께 정하고, 광고 내용이 원칙에 맞는지 확인해요." },
  { no: "04", title: "시작과 결과 공유", text: "정한 날부터 진행하고, 끝나면 노출·클릭 수를 정리해 드려요." },
];

const RULES = [
  { Icon: BadgeCheck, title: "광고는 광고라고 표시해요", text: "모든 배너에 AD 표시가 붙어요. 후기나 추천인 것처럼 꾸미지 않아요." },
  { Icon: ShieldCheck, title: "사실과 다른 내용은 싣지 않아요", text: "허위·과장 문구, 확인되지 않은 효능 표현, 다른 곳 비방, 남의 사진·상표를 쓴 광고는 내려요." },
  { Icon: Ban, title: "동물을 사고파는 광고는 받지 않아요", text: "분양·교배 홍보는 받지 않아요. 같이가개는 입양을 권해요." },
];

const FAQ = [
  { q: "가게 사장님인데, 문의를 꼭 남겨야 하나요?", a: "아니요. 사장님으로 가입해 사업자 인증을 마치면 사장님 화면에서 요금제를 고르고 배너를 직접 만들 수 있어요. 궁금한 점이 있을 때만 문의를 남겨 주세요." },
  { q: "오프라인 매장이 없는 브랜드도 함께할 수 있나요?", a: "네. 사료·간식·용품처럼 매장 없이 판매하는 브랜드도 협업할 수 있어요. 알리고 싶은 상품과 원하는 방식을 적어 주시면 맞는 방법을 제안해 드려요." },
  { q: "광고비를 더 내면 더 많이 노출되나요?", a: "동네 배너는 그렇지 않아요. 같은 동네에 배너를 낸 가게는 모두 같은 횟수만큼 노출돼요. 가게 사이에 차이를 두지 않아요." },
  { q: "배너 내용은 얼마나 자주 바꿀 수 있나요?", a: "2주에 한 번 바꿀 수 있어요. 오타처럼 급하게 고쳐야 할 때는 사장님 화면에서 한도 변경을 요청하면 확인 후 열어 드려요." },
  { q: "광고 효과를 보장하나요?", a: "노출 기회를 드리는 것이고, 방문자 수나 매출 증가를 보장하지는 않아요. 대신 노출·클릭 수를 숨김없이 보여 드려요." },
  { q: "어떤 광고는 받지 않나요?", a: "동물 판매·분양, 사실 확인이 안 되는 효능 표현, 반려동물에게 해로울 수 있는 상품, 관계 법령에 어긋나는 광고는 받지 않아요." },
  { q: "답은 언제 받을 수 있나요?", a: "보통 영업일 기준 2~3일 안에 적어 주신 이메일이나 전화로 연락드려요." },
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
            <style>{`@media (max-width: 640px) { .partner-nav-link { display: none; } }`}</style>
            <a href="#offers" className="partner-nav-link" style={navLink}>할 수 있는 것</a>
            <a href="#how" className="partner-nav-link" style={navLink}>노출 방식</a>
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
          <h1 className="ggk-logo" style={{ margin: "18px 0 0", fontSize: "clamp(28px, 6vw, 52px)", fontWeight: 800, lineHeight: 1.24 }}>
            반려동물을 위해 고르는 순간,<br />
            <span style={{ color: "#FFE9A8" }}>먼저 떠오르는 이름으로.</span>
          </h1>
          <p style={{ margin: "18px 0 0", fontSize: "clamp(15px, 2.4vw, 18px)", lineHeight: 1.7, color: "rgba(255,255,255,0.92)", maxWidth: 600 }}>
            같이가개에는 반려동물과 함께 사는 보호자가 모여요.<br />
            동네 가게부터 사료·간식·용품 브랜드까지, 꼭 필요한 보호자에게 알려 드려요.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="#inquiry" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 999, background: "#FFE9A8", color: "#3b3215", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
              문의 남기기 <ArrowRight size={17} />
            </a>
            <Link href="/signup-owner" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.55)", color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              <Store size={16} /> 가게 사장님으로 시작하기
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
          <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>2026년 10월 기준 · 같이가개가 안내하는 장소와 공고의 규모예요</div>
        </div>
      </section>

      {/* ── 누가 보나요 ── */}
      <section style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0" }}>
        <div style={eyebrow}>누가 보나요</div>
        <h2 className="ggk-logo" style={h2}>반려동물에게 진심인 보호자가 와요.</h2>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
          {AUDIENCE.map((a) => (
            <div key={a.title} style={{ padding: "22px 20px", borderRadius: 20, background: "white", border: "1px solid #ece6d6" }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center" }}><a.Icon size={20} color="#48603A" /></div>
              <div className="ggk-logo" style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>{a.title}</div>
              <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7, color: "#59624f" }}>{a.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 할 수 있는 것 ── */}
      <section id="offers" style={{ ...wrap, padding: "clamp(44px, 7vw, 76px) 22px 8px", scrollMarginTop: 60 }}>
        {OFFERS.map((f, i) => (
          <div key={f.no} style={{ display: "flex", gap: "clamp(16px, 4vw, 44px)", alignItems: "center", flexWrap: "wrap", flexDirection: i % 2 ? "row-reverse" : "row", marginBottom: "clamp(36px, 6vw, 64px)" }}>
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: f.color }}>{f.no} · {f.who}</div>
              <h2 className="ggk-logo" style={h2}>{f.title[0]}<br />{f.title[1]}</h2>
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

      {/* ── 노출 방식 ── */}
      <section id="how" style={{ background: "white", borderTop: "1px solid #ece6d6", borderBottom: "1px solid #ece6d6", scrollMarginTop: 58 }}>
        <div style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px" }}>
          <div style={eyebrow}>동네 배너는 이렇게 나가요</div>
          <h2 className="ggk-logo" style={h2}>가까운 사람에게, 모두 똑같이.</h2>
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {HOW.map((s, i) => (
              <div key={s.title} style={{ padding: "22px 20px", borderRadius: 20, background: BEIGE, border: "1px solid #ece6d6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ggk-logo" style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>0{i + 1}</span>
                  <s.Icon size={18} color={GREEN} />
                </div>
                <div className="ggk-logo" style={{ marginTop: 10, fontSize: 17, fontWeight: 800 }}>{s.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.65, color: "#59624f" }}>{s.text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: "#8a8f80", lineHeight: 1.7 }}>배너는 커뮤니티와 마이페이지에 보여요. PC에서는 화면 양옆에, 휴대폰에서는 화면 위쪽에 한 줄로 나가요. 브랜드 협업의 노출 방식은 상담하면서 따로 정해요.</div>
        </div>
      </section>

      {/* ── 진행 순서 ── */}
      <section style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0" }}>
        <div style={eyebrow}>진행 순서</div>
        <h2 className="ggk-logo" style={h2}>문의부터 결과 공유까지.</h2>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {STEPS.map((s) => (
            <div key={s.no} style={{ padding: "20px 18px", borderRadius: 18, background: "white", border: "1px solid #ece6d6" }}>
              <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#c9d6bd" }}>{s.no}</div>
              <div className="ggk-logo" style={{ marginTop: 6, fontSize: 16.5, fontWeight: 800 }}>{s.title}</div>
              <div style={{ marginTop: 5, fontSize: 13.5, lineHeight: 1.65, color: "#59624f" }}>{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 요금 ── */}
      <section id="price" style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0", scrollMarginTop: 60 }}>
        <div style={{ borderRadius: 28, background: "#FFF8E6", border: "1px solid #F3DFA6", padding: "clamp(22px, 5vw, 40px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "#F59E0B", color: "white", fontSize: 12.5, fontWeight: 800 }}><Store size={13} /> 가게 사장님 요금제</div>
          <h2 className="ggk-logo" style={{ ...h2, color: "#5b3d05", marginTop: 12 }}>첫 달은 무료로 써 보세요.</h2>
          <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.75, color: "#7a5a17" }}>
            첫 달 무료, 2~3개월째 반값, 4개월째부터 정가예요. 의무 이용 기간과 해지 위약금이 없고, 자동으로 결제하지 않아요. 지금은 시범 운영 요금이며 바뀔 때는 미리 알려 드려요.
          </p>
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {paidPlans.map((plan) => (
              <div key={plan.id} style={{ padding: "18px 18px", borderRadius: 18, background: "white", border: `1px solid ${plan.id === "local" ? "#E9B949" : "#F3DFA6"}` }}>
                <div className="ggk-logo" style={{ fontSize: 16.5, fontWeight: 800, color: "#5b3d05" }}>{plan.name}</div>
                <div style={{ fontSize: 12.5, color: "#8a6a25", marginTop: 2 }}>{plan.tagline}</div>
                <div className="ggk-logo" style={{ marginTop: 10, fontSize: 21, fontWeight: 800, color: "#B45309" }}>월 {won(plan.monthlyPrice)}</div>
                <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
                  {plan.features.map((feature) => <li key={feature} style={{ fontSize: 12.5, lineHeight: 1.55, color: "#6b5a2e", paddingLeft: 12, position: "relative" }}><span style={{ position: "absolute", left: 0, color: "#D4A24C" }}>·</span>{feature}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: "#8a6a25", lineHeight: 1.7 }}>부가세 포함 정가예요. 브랜드 협업과 기관·서비스 제휴는 범위에 따라 달라서 문의를 주시면 따로 안내해 드려요.</div>
          <Link href="/signup-owner" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 20px", borderRadius: 999, background: "#B45309", color: "white", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>
            사장님으로 시작하기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── 지키는 원칙 ── */}
      <section style={{ ...wrap, padding: "clamp(40px, 7vw, 68px) 22px 0" }}>
        <div style={eyebrow}>광고에서 지키는 것</div>
        <h2 className="ggk-logo" style={h2}>보호자가 믿을 수 있어야 광고도 통해요.</h2>
        <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
          {RULES.map((r) => (
            <div key={r.title} style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "16px 18px", borderRadius: 16, background: "white", border: "1px solid #ece6d6" }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.Icon size={18} color="#48603A" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{r.title}</div>
                <div style={{ fontSize: 13.5, color: "#59624f", marginTop: 3, lineHeight: 1.65 }}>{r.text}</div>
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
              <div style={{ marginTop: 9, fontSize: 14, lineHeight: 1.75, color: "#59624f" }}>{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── 문의 양식 ── */}
      <section style={{ ...wrap, maxWidth: 760, padding: "clamp(40px, 7vw, 68px) 22px var(--ggk-tabbar-space)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, ...eyebrow }}><MessageSquareText size={15} />문의하기</div>
          <h2 className="ggk-logo" style={h2}>편하게 남겨 주세요.</h2>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#59624f", lineHeight: 1.7 }}>정해진 것이 없어도 괜찮아요. 알리고 싶은 가게·브랜드·상품만 적어 주시면 맞는 방법을 같이 찾아 드려요.</p>
        </div>
        <PartnershipForm />
        <div style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: "#9aa191" }}>© 2026 같이가개 · <Link href="/about" style={{ color: "#7b8570", fontWeight: 700 }}>서비스 소개</Link> · <Link href="/" style={{ color: "#7b8570", fontWeight: 700 }}>지도 열기</Link></div>
      </section>
    </div>
  );
}
