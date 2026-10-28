import type { Metadata } from "next";
import { siteUrl } from "@/lib/siteUrl";
import StayClient from "./StayClient";

// ── 숙소 탭(/stay) ──
// 반려동물 동반 숙소를 숙박 예약 앱처럼 찾고, 같이가개에서 바로 예약할 수 있는 숙소를 먼저 보여 주는 화면입니다.

const title = "숙소 | 같이가개";
const description = "반려동물 동반이 가능한 펜션·호텔·캠핑장을 찾고, 동반 조건을 확인한 뒤 바로 예약하세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/stay` },
  openGraph: { title, description, url: `${siteUrl}/stay`, siteName: "같이가개", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

export default function StayPage() {
  return <StayClient />;
}
