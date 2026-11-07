import type { Metadata } from "next";
import { siteUrl } from "@/lib/siteUrl";
import StayClient from "./StayClient";
import { GET as listStays } from "@/app/api/lodging/list/route";

// 속도(2026-11-07): 서버가 숙소 목록을 채워서 보냅니다 — 화면이 뜨는 순간 목록이 보입니다. 5분마다 새로 만들어 둡니다.
export const revalidate = 300;

// ── 숙소 탭(/stay) ──
// 반려동물 동반 숙소를 숙박 예약 앱처럼 찾고, 펫츠로드에서 바로 예약할 수 있는 숙소를 먼저 보여 주는 화면입니다.

const title = "숙소 | 펫츠로드";
const description = "반려동물 동반이 가능한 펜션·호텔·캠핑장을 찾고, 동반 조건을 확인한 뒤 바로 예약하세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/stay` },
  openGraph: { title, description, url: `${siteUrl}/stay`, siteName: "펫츠로드", locale: "ko_KR", type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
};

export default async function StayPage() {
  const initial = await listStays().then((r) => (r.ok ? r.json() : null)).then((d) => d?.items ?? null).catch(() => null);
  return <StayClient initial={initial} />;
}
