import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import TabBar from "@/components/TabBar";
import { AuthProvider } from "@/lib/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        <script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" defer />
        <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=YOUR_KEY&autoload=false" defer />
      </head>
      <body
        style={{
          margin: 0,
          overflow: "hidden",
        }}
      >
      <AuthProvider>
        <AuthGuard />
        {children}
        {modal}
        <TabBar />
      </AuthProvider>
      </body>
    </html>
  );
}