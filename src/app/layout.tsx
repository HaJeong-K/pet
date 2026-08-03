import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import TabBar from "@/components/TabBar";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { AuthProvider } from "@/lib/AuthContext";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
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