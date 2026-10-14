import type { Metadata } from "next";
import { siteUrl } from "@/lib/siteUrl";
import ShopClient from "./ShopClient";

// ── 쇼핑 탭(/shop) ──
// 동네 반려동물 가게가 올린 상품을 모아 보고, 미리 예약해 두었다가 가게에서 받아 가는 화면입니다(예약 포장).
// '프리미엄 스토어' 이상을 이용 중인 가게의 상품이 가까운 순으로 나옵니다. 결제는 가게에서 합니다.

const title = "쇼핑 | 같이가개";
const description = "동네 반려동물 가게의 간식·용품을 미리 예약하고 가게에서 받아 가세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/shop` },
  openGraph: { title, description, url: `${siteUrl}/shop`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

export default function ShopPage() {
  return <ShopClient />;
}
