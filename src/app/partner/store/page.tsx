import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarCheck, ShieldCheck, ShoppingBag, Utensils } from "lucide-react";
import StorePartnerForm from "./StorePartnerForm";

// 쇼핑 입점 안내·상담 신청(/partner/store?place=번호) — 카페·식당·수제 간식 가게 사장님용.
// 장소 상세의 "이 가게 사장님이신가요?"에서 들어옵니다. 신청은 StorePartnerForm(/api/owner/store-partner).

export const metadata: Metadata = {
  title: "쇼핑 입점 상담 | 같이가개",
  description: "카페·식당·수제 간식 가게의 포장 주문과 매장 식사 예약을 같이가개에서 받아 보세요.",
};

const POINTS = [
  { Icon: ShoppingBag, title: "포장 주문", text: "손님이 쇼핑 탭에서 메뉴를 고르고 미리 결제해요. 가게는 시간에 맞춰 준비하면 돼요." },
  { Icon: Utensils, title: "매장 식사 예약", text: "반려동물과 함께 올 손님의 인원·시간·메뉴를 미리 받아요." },
  { Icon: ShieldCheck, title: "노쇼 걱정 줄이기", text: "미리 결제하는 방식이라, 준비를 시작한 뒤의 취소·노쇼는 환불되지 않고 가게에 정산돼요." },
  { Icon: CalendarCheck, title: "주문 관리", text: "사장님 센터에서 확정·준비 완료·이용 완료를 관리하고, 새 주문은 알림으로 받아요." },
];
const TERMS = [
  "대상: 카페·식당·디저트·반려동물 수제 간식·용품 가게(공원·병원·숙소 제외)",
  "결제: 손님이 주문할 때 미리 결제하고, 결제가 끝난 주문만 사장님에게 전달돼요.",
  "취소: 가게가 확정하기 전에는 손님이 바로 취소할 수 있고 전액 환불돼요. 확정 뒤에는 손님이 취소를 요청하고, 사장님이 받아 줄 때만 환불돼요. 12시간 안에 확인하지 않은 주문은 자동 취소돼요.",
  "수수료·요금: 상담할 때 안내해 드려요.",
];

export default function PartnerStorePage() {
  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#FBF7F1", color: "#23201B", wordBreak: "keep-all" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px clamp(16px, 4vw, 24px) calc(var(--ggk-tabbar-space) + 16px)" }}>
        <Link href="/" aria-label="같이가개 지도" style={{ display: "inline-flex" }}>
          <Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ height: 32, width: "auto" }} priority />
        </Link>
        <h1 className="ggk-logo" style={{ margin: "20px 0 0", fontSize: "clamp(25px, 4vw, 34px)", fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.5px", color: "#4A3021" }}>
          반려동물과 오는 손님을<br /><span style={{ color: "#A0663A" }}>쇼핑 탭에서 미리 만나 보세요</span>
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 15, color: "#5F4D3A", lineHeight: 1.7 }}>같이가개에 가입한 사장님이면 누구나 입점 상담을 받을 수 있어요.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 10, marginTop: 20 }}>
          {POINTS.map(({ Icon, title, text }) => (
            <div key={title} style={{ padding: "15px 16px", borderRadius: 16, background: "white", border: "1px solid #EFE6DA" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: "#4A3021" }}><Icon size={18} color="#A0663A" />{title}</div>
              <div style={{ fontSize: 13.5, color: "#5F4D3A", marginTop: 6, lineHeight: 1.65 }}>{text}</div>
            </div>
          ))}
        </div>

        <h2 className="ggk-logo" style={{ margin: "26px 0 8px", fontSize: 19, fontWeight: 800, color: "#4A3021" }}>입점 조건</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "#5F4D3A", lineHeight: 1.85 }}>
          {TERMS.map((t) => <li key={t}>{t}</li>)}
        </ul>

        <h2 className="ggk-logo" style={{ margin: "26px 0 10px", fontSize: 19, fontWeight: 800, color: "#4A3021" }}>입점 상담 신청</h2>
        <Suspense fallback={null}><StorePartnerForm /></Suspense>
      </div>
    </div>
  );
}
