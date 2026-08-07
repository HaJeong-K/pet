import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import TabBar from "@/components/TabBar";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { AuthProvider } from "@/lib/AuthContext";
import Script from "next/script";

// ⚠ 최적화: 여기서 Geist/Geist Mono(next/font/google)를 불러오고 있었는데, 실제로는
// <body>에 그 클래스/CSS 변수를 한 번도 적용하지 않아서(className 미부착) 화면에
// 전혀 쓰이지 않는 죽은 폰트였습니다. 이 프로젝트는 실제로 Pretendard(.ggk-logo)와
// Noto Sans KR(.ggk-body, 대부분의 본문)만 씁니다. 안 쓰는 웹폰트 2종을 통째로
// 제거해서 폰트 다운로드/파싱 비용을 없앴습니다.

const siteUrl = "https://main.d2ywd3m1zdoku3.amplifyapp.com";
const siteTitle = "같이가개";
const siteDescription = "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: siteTitle,
    images: [
      {
        url: "/icons/header_logo_final.png",
        alt: siteTitle,
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/icons/header_logo_final.png"],
  },
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 공통 웹폰트 — CSS @import 대신 <link>로 로드합니다. globals.css에서
            @import url(...)로 불러오면 Tailwind v4 PostCSS 처리 순서와 충돌해
            "@import rules must precede all rules" 빌드 에러가 났었습니다. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
        />
      </head>
      <body
        style={{
          margin: 0,
          overflow: "hidden",
        }}
      >
        {/* ⚠ 최적화: 카카오 로그인/공유 SDK는 로그인 버튼·공유 버튼을 눌러야만 쓰이는데
            beforeInteractive로 불러오면 그 전까지 페이지 자체가 상호작용 불가능 상태로
            묶여 있었습니다(첫 로딩 체감 지연의 주요 원인). afterInteractive로 바꿔서
            페이지가 먼저 뜨고 나서 곧이어 백그라운드로 불러오도록 했습니다. */}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          strategy="afterInteractive"
        />
        {/* libraries=clusterer 필수: 이게 없으면 window.kakao.maps.MarkerClusterer가 undefined라
            KakaoMap.tsx가 넓은 줌(레벨 7 이상)에서 클러스터 마커를 만들다 조용히 실패해서
            그 구간에서 마커가 통째로 안 보이는 문제가 있었습니다. */}
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=clusterer&autoload=false`}
          strategy="afterInteractive"
        />
        <AuthProvider>
          <AuthGuard />
          <AnalyticsTracker />
          {children}
          {modal}
          <TabBar />
        </AuthProvider>
      </body>
    </html>
  );
}