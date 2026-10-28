import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck, BedDouble, CalendarCheck, Coffee, FileText, MapPin, PawPrint, Wallet } from "lucide-react";
import PartnerStartButton from "./PartnerStartButton";
import {
  AUTO_CONFIRM_DAYS, BASIC_FEE_RATE, CANCEL_FEE_RATE, LODGING_CONTRACT_VERSION, PREMIUM_FEE_RATE, PROMO_FEE_RATE, PROMO_MONTHS,
} from "@/lib/lodgingPolicy";

// 숙소 사장님용 입점 안내(/partner/lodging) — 숙소 상세의 "이 숙소 사장님이신가요?"에서 들어옵니다.
//   ?place=번호 가 붙어 오면 입점 신청 화면에서 그 숙소를 미리 골라 둡니다(PartnerStartButton).
// 수수료 숫자는 src/lib/lodgingPolicy.ts에서 그대로 가져옵니다(계약서와 같은 값).
// "업계 최저" 같은 비교 표현은 쓰지 않습니다 — 반려동물 전문·숙소 근처 즐길 거리를 강조합니다.

export const metadata: Metadata = {
  title: "숙소 입점 안내 | 같이가개",
  description: "반려동물과 여행하는 손님만 모이는 숙소 예약 서비스, 같이가개에 숙소를 입점해 보세요.",
};

const BLUE = "#1D4F91";
const wrap: React.CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "20px 16px var(--ggk-tabbar-space)", wordBreak: "keep-all" };
const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #e3eaf3", padding: "20px 18px" };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#222", margin: "0 0 12px" };

const POINTS = [
  { Icon: PawPrint, title: "반려동물과 여행하는 손님만", text: "같이가개 손님은 처음부터\n반려동물 동반 숙소를 찾고 있어요." },
  { Icon: Coffee, title: "숙소 근처 즐길 거리까지 한 번에", text: "숙소 화면에서 근처 동반 카페·식당·공원을 함께 보여 줘서\n손님이 머무는 동안 놀고 쉴 곳을 바로 찾을 수 있어요." },
  { Icon: BadgeCheck, title: "동반 조건을 미리 정확하게", text: "크기·몸무게·마릿수·추가 요금을 예약 전에 크게 보여 줘서\n현장에서 생기는 다툼을 줄여요." },
  { Icon: Wallet, title: "광고비 없이 수수료만", text: "가입비·광고비·쿠폰 비용이 없습니다.\n예약이 이용 확정된 건에만 수수료가 붙어요." },
];

const STEPS = [
  { Icon: BadgeCheck, title: "사장님 가입·인증", text: "사업자등록번호로 숙소 사장님 인증을 받습니다." },
  { Icon: FileText, title: "입점 신청", text: "숙소 선택, 숙박업 영업신고증, 정산 계좌, 계약 동의" },
  { Icon: BedDouble, title: "객실·동반 규정 등록", text: "심사 중에도 미리 올려 둘 수 있습니다." },
  { Icon: CalendarCheck, title: "승인 후 예약 받기", text: "보통 1~2영업일 안에 확인하고, 승인일이 입점일이 됩니다." },
];

const TERMS = [
  `수수료: 입점일부터 ${PROMO_MONTHS}개월 동안 체크인하는 예약은 ${PROMO_FEE_RATE}%, 이후 ${BASIC_FEE_RATE}%입니다. 숙소 프리미엄 이용 기간에는 ${PREMIUM_FEE_RATE}%입니다.`,
  "결제: 손님은 예약할 때 전액을 결제하고, 같이가개가 이용 확정 때까지 보관합니다.",
  `이용 확정: 체크아웃 날부터 손님이 '이용 확정'을 누를 수 있고, ${AUTO_CONFIRM_DAYS}일 안에 누르지 않으면 자동으로 확정됩니다.`,
  "정산: 이용 확정 다음 영업일에 수수료를 뺀 금액을 등록한 계좌로 보내 드립니다.",
  `취소·환불: 공정거래위원회 소비자분쟁해결기준(숙박업)을 따릅니다. 손님 사정 취소의 위약금은 숙소 몫이며, 위약금에서 취소 정산 수수료 ${CANCEL_FEE_RATE}%를 뺀 금액을 정산합니다.`,
  "숙소 사정 취소: 손님에게 전액 환불하고 기준에 따른 배상금을 드리며, 배상금은 다음 정산에서 뺍니다.",
  "동반 조건 준수: 등록한 동반 조건에 맞는 손님의 입실을 거부하면 숙소 사정 취소와 같이 처리합니다.",
  "조건 변경: 계약 조건을 바꿀 때는 30일 전에 알려 드리며, 동의하지 않으면 위약금 없이 해지할 수 있습니다.",
];

export default function PartnerLodgingPage() {
  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F4F7FB" }}>
      <div style={wrap}>
        {/* 머리말 */}
        <div style={{ borderRadius: 22, background: "linear-gradient(135deg,#1D4F91,#3A7BD5)", color: "white", padding: "28px 22px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.2)", fontSize: 12, fontWeight: 800 }}>
            <BedDouble size={13} />숙소 사장님 입점 안내
          </div>
          <h1 className="ggk-logo" style={{ fontSize: 24, fontWeight: 800, margin: "12px 0 0", lineHeight: 1.4 }}>
            반려동물과 여행하는 손님을<br />우리 숙소로 맞이하세요
          </h1>
          <p style={{ fontSize: 14, opacity: 0.92, margin: "10px 0 0", lineHeight: 1.7 }}>
            같이가개는 반려동물 동반 장소 지도에서 시작한<br />
            반려동물 전문 숙소 예약 서비스입니다.
          </p>
          <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.14)" }}>
            <div style={{ fontSize: 12.5, opacity: 0.9 }}>입점 프로모션</div>
            <div className="ggk-logo" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>입점일부터 {PROMO_MONTHS}개월, 수수료 {PROMO_FEE_RATE}%</div>
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4, lineHeight: 1.6 }}>이후 기본 {BASIC_FEE_RATE}% · 숙소 프리미엄 이용 시 {PREMIUM_FEE_RATE}%<br />가입비·광고비 없음</div>
          </div>
          <Suspense fallback={null}><PartnerStartButton /></Suspense>
        </div>

        {/* 같이가개 숙소 예약의 특징 */}
        <div style={{ ...card, marginTop: 14 }}>
          <h2 className="ggk-logo" style={h2}>같이가개에 입점하면</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {POINTS.map(({ Icon, title, text }) => (
              <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "#E3EDFA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} color={BLUE} /></div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "#222" }}>{title}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 3, lineHeight: 1.7, whiteSpace: "pre-line" }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 진행 절차 */}
        <div style={{ ...card, marginTop: 14 }}>
          <h2 className="ggk-logo" style={h2}>진행 절차</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {STEPS.map(({ Icon, title, text }, i) => (
              <div key={title} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 14, background: "#F7F9FC" }}>
                <div style={{ width: 26, height: 26, borderRadius: 999, background: BLUE, color: "white", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 800, color: "#222" }}><Icon size={14} color={BLUE} />{title}</div>
                  <div style={{ fontSize: 12.5, color: "#666", marginTop: 2, lineHeight: 1.6 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 12, fontSize: 12, color: "#888", lineHeight: 1.6 }}>
            <MapPin size={13} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>지도에 아직 없는 숙소도 신청할 수 있습니다.<br />같이가개가 확인한 뒤 지도에 등록해 드립니다.</span>
          </div>
        </div>

        {/* 주요 계약 조건 */}
        <div id="terms" style={{ ...card, marginTop: 14, scrollMarginTop: 16 }}>
          <h2 className="ggk-logo" style={h2}>주요 입점 조건</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13, color: "#444", lineHeight: 1.75 }}>
            {TERMS.map((t) => <li key={t}>{t}</li>)}
          </ol>
          <div style={{ marginTop: 12, fontSize: 11.5, color: "#999" }}>같이가개 숙소 입점 계약서 {LODGING_CONTRACT_VERSION}판 기준 · 전문은 입점 신청 때 함께 안내해 드립니다.</div>
        </div>
      </div>
    </div>
  );
}
