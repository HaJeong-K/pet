import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Handshake, MapPin, Users, BarChart3, ArrowLeft } from "lucide-react";
import { siteUrl } from "@/lib/siteUrl";
import PartnershipForm from "./PartnershipForm";

// ── 광고·제휴 안내(/partnership) ──
// 사이트 아래의 "광고·제휴 문의"에서 들어옵니다. 어떤 광고·제휴가 가능한지 안내하고, 아래 양식으로 문의를 받습니다.
// 문의는 관리자 화면(/admin/inquiries)에 쌓이고 관리자에게 바로 알림이 갑니다.
// 가게 사장님의 배너 광고는 여기가 아니라 사장님 센터(/owner)에서 직접 신청·제작합니다.

const title = "광고·제휴 안내 | 같이가개";
const description = "반려동물과 함께 다니는 보호자에게 브랜드와 가게를 알리고 싶다면 같이가개에 문의해 주세요. 지역 배너 광고, 브랜드 홍보, 서비스 제휴를 안내해 드려요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/partnership` },
  openGraph: { title, description, url: `${siteUrl}/partnership`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

const GREEN = "#5C7A4A";
const OFFERS = [
  { Icon: MapPin, title: "지역 배너 광고", text: "가게가 있는 시·군·구의 보호자에게 커뮤니티·마이페이지 배너로 먼저 보여요. 문구·사진·글꼴을 직접 골라 만들 수 있어요." },
  { Icon: Megaphone, title: "브랜드·상품 홍보", text: "사료·용품·보험·여행처럼 반려 가구를 대상으로 하는 브랜드의 홍보를 함께 기획해요. 지역이나 주제에 맞춰 노출할 수 있어요." },
  { Icon: Handshake, title: "서비스·콘텐츠 제휴", text: "지자체·기관의 반려동물 동반 시설 안내, 행사, 유기동물 입양 홍보처럼 함께하면 좋은 일을 제안해 주세요." },
];
const FACTS = [
  { Icon: Users, text: "반려동물과 갈 곳을 찾는 보호자가 지도·커뮤니티·입양 공고를 보러 와요." },
  { Icon: MapPin, text: "광고는 사는 곳 가까운 가게부터, 없으면 최근에 찾아본 지역의 가게를 보여 줘요." },
  { Icon: BarChart3, text: "노출·클릭 수를 세어 성과를 숫자로 알려 드려요. 방문·매출 증가를 보장하지는 않아요." },
];

export default function PartnershipPage() {
  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8", wordBreak: "keep-all" }}>
      <div style={{ background: GREEN, padding: "26px 20px 30px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.85)", textDecoration: "none" }}><ArrowLeft size={14} />같이가개 지도로</Link>
          <h1 className="ggk-logo" style={{ margin: "14px 0 0", fontSize: 24, fontWeight: 800, color: "white", lineHeight: 1.35 }}>광고·제휴 안내</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.7 }}>반려동물과 함께 다니는 보호자에게 가게와 브랜드를 알리고 싶다면, 편하게 문의해 주세요.</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 16px var(--ggk-tabbar-space)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          {OFFERS.map(({ Icon, title: name, text }) => (
            <div key={name} style={{ background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "16px 16px" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color="#48603A" /></div>
              <div className="ggk-logo" style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "#222" }}>{name}</div>
              <div style={{ marginTop: 5, fontSize: 12.5, color: "#666", lineHeight: 1.7 }}>{text}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "16px 16px", display: "grid", gap: 9 }}>
          {FACTS.map(({ Icon, text }) => (
            <div key={text} style={{ display: "flex", gap: 9, fontSize: 13, color: "#444", lineHeight: 1.65 }}><Icon size={15} color={GREEN} style={{ flexShrink: 0, marginTop: 3 }} />{text}</div>
          ))}
        </div>

        <div style={{ marginTop: 12, padding: "13px 15px", borderRadius: 14, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 12.5, color: "#78350F", lineHeight: 1.7 }}>
          <b>반려동물 동반 가게 사장님이신가요?</b>{" "}사장님 인증을 마치면 사장님 화면에서 요금제를 고르고 배너를 직접 만들 수 있어요. 문의 없이 바로 시작하려면 지도 화면의 &ldquo;사장님으로 전환하기&rdquo;를 이용해 주세요.
        </div>

        <PartnershipForm />
      </div>
    </div>
  );
}
