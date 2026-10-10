import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import TabBar from "@/components/TabBar";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ErrorReporter from "@/components/ErrorReporter";
import { AuthProvider } from "@/lib/AuthContext";
import Script from "next/script";
import { siteUrl } from "@/lib/siteUrl";

// ⚠ 최적화: 여기서 Geist/Geist Mono(next/font/google)를 불러오고 있었는데, 실제로는
// <body>에 그 클래스/CSS 변수를 한 번도 적용하지 않아서(className 미부착) 화면에
// 전혀 쓰이지 않는 죽은 폰트였습니다. 이 프로젝트는 Noto Sans KR 하나(제목 .ggk-logo·본문
// .ggk-body 공통)와 입양 카드 문구용 Gaegu만 씁니다(아래 글꼴 스크립트 참고). 안 쓰는 웹폰트 2종을 통째로
// 제거해서 폰트 다운로드/파싱 비용을 없앴습니다.

// 카카오맵 안내 파일 주소(지도 엔진의 시작점).
const KAKAO_MAP_SDK = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=clusterer&autoload=false`;

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
    // 공유 그림 — 미리 만들어 둔 1200×630 그림(핀 로고 + "같이 갈 수 있는 곳, 지도에서 한눈에" + 지도 한 조각).
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
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
    images: ["/og-default.png"],
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
        {/* ⚠ 최적화: 카카오맵 SDK·로그인 스크립트가 afterInteractive로 늦게 붙긴 하지만,
            실제 요청이 시작될 때 DNS 조회/TLS 핸드셰이크부터 새로 하면 그만큼 늦어집니다.
            preconnect로 미리 커넥션만 열어두면 그 시간을 아낄 수 있습니다. */}
        <link rel="preconnect" href="https://dapi.kakao.com" />
        <link rel="preconnect" href="https://t1.kakaocdn.net" crossOrigin="" />
        {/* 공통 웹폰트 — CSS @import 대신 <link>로 로드합니다. globals.css에서
            @import url(...)로 불러오면 Tailwind v4 PostCSS 처리 순서와 충돌해
            "@import rules must precede all rules" 빌드 에러가 났었습니다. */}
        {/* 글꼴 파일을 받는 서버에도 미리 연결해 둡니다(글꼴이 늦게 바뀌어 보이는 시간을 줄임). */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* ⚠ 속도: 웹 글꼴 — 사이트 전체를 Noto Sans KR 하나로 통일했습니다(PC·폰 같은 글꼴).
            예전에는 본문 Noto Sans KR(굵기 4종) + 제목 Pretendard를 따로 받았는데, 한글 글꼴은 글자를 조각으로 나눠
            두는 방식이라 조각이 1,324개나 됐고, 그걸 화면에 적용하는 계산만 느린 폰에서 1초 넘게 걸렸습니다.
            굵기를 한 파일로 다루는 방식(wght@400..800)으로 바꿔 조각을 124개로 줄였습니다(입양 카드 문구용 손글씨
            Gaegu 124개 포함 248개).
            또 <link rel="stylesheet">로 넣으면 글꼴 목록을 다 받을 때까지 화면에 아무것도 그려지지 않으므로, 화면이
            다 뜬 뒤 한가할 때 붙입니다 — 글자는 기기 글꼴로 먼저 보이다가 바뀝니다(안드로이드는 기기 글꼴이 같은
            계열이라 거의 티가 나지 않습니다). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var u="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400..800&family=Gaegu:wght@700&display=swap";var done=false;function add(){if(done)return;done=true;var l=document.createElement("link");l.rel="stylesheet";l.href=u;document.head.appendChild(l);}function soon(){if(window.requestIdleCallback){requestIdleCallback(add,{timeout:2500});}else{setTimeout(add,300);}}if(document.readyState==="complete"){soon();}else{window.addEventListener("load",soon);}setTimeout(add,6000);})();`,
          }}
        />
        {/* 불러오는 화면의 로고 그림 — 화면이 그려지자마자 보이도록 미리 받습니다. */}
        <link rel="preload" as="image" href="/icons/logo_mark.png" />
        {/* ⚠ 속도("지도 먼저"): 지도 엔진(카카오맵)을 다른 코드보다 먼저 받고, 지도 화면으로 들어온 경우에는 엔진이
            준비되는 즉시 지도부터 그립니다 — 화면의 나머지 코드(검색·목록·버튼 등)가 준비되기를 기다리지 않습니다.
            지난번 위치가 저장돼 있으면 그곳, 없으면 서울시청이 가운데입니다. 이렇게 먼저 만든 지도는 KakaoMap.tsx의
            initializeMap이 그대로 넘겨받아 씁니다(window.__ggkEarlyMap). 다른 화면에서는 엔진 준비까지만 합니다.
            libraries=clusterer 필수: 없으면 넓은 줌(레벨 7 이상)에서 묶음 마커가 통째로 안 보입니다. */}
        {/* 지도 엔진은 "안내 파일(sdk.js) → 본체(kakao.js) → 묶음 마커(clusterer.js)"를 차례로 받는데, 본체와 묶음 마커를
            미리 받아 두면 차례를 기다리는 시간이 없어집니다. ⚠ 아래 두 주소의 버전(4.5.28 / 1.1.4)은 카카오가 안내 파일에
            적어 둔 값과 같아야 효과가 있습니다. 카카오가 버전을 올리면 지도는 그대로 정상 동작하고 미리 받기만 헛일이
            되므로, 그때 이 숫자를 새 버전으로 바꾸면 됩니다(브라우저 콘솔에 "preload ... not used" 경고가 뜹니다). */}
        <link rel="preconnect" href="https://mts.kakaocdn.net" />
        <link rel="preload" as="script" href={KAKAO_MAP_SDK} fetchPriority="high" />
        <link rel="preload" as="script" href="//t1.kakaocdn.net/mapjsapi/js/main/4.5.28/kakao.js" fetchPriority="high" />
        <link rel="preload" as="script" href="//t1.kakaocdn.net/mapjsapi/js/libs/clusterer/1.1.4/clusterer.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var S=${JSON.stringify(KAKAO_MAP_SDK)};var isMap=location.pathname==="/";function early(){try{var m=window.kakao.maps;if(!document.body||document.getElementById("map")||window.__ggkEarlyMap)return;var lat=parseFloat(localStorage.getItem("user_lat")),lng=parseFloat(localStorage.getItem("user_lng"));if(isNaN(lat)||isNaN(lng)){lat=37.5665;lng=126.978;}var el=document.createElement("div");el.id="ggk-early-map";el.style.cssText="position:fixed;inset:0;z-index:2";document.body.appendChild(el);var map=new m.Map(el,{center:new m.LatLng(lat,lng),level:3,scrollwheel:true,disableDoubleClickZoom:false});var h={map:map,el:el,painted:false};window.__ggkEarlyMap=h;try{m.event.addListener(map,"tilesloaded",function(){h.painted=true;});}catch(e){h.painted=true;}}catch(e){}}var s=document.createElement("script");s.src=S;s.async=true;try{s.fetchPriority="high";}catch(e){}if(isMap){s.onload=function(){try{window.kakao.maps.load(function(){if(document.body)early();else document.addEventListener("DOMContentLoaded",early);});}catch(e){}};}document.head.appendChild(s);})();`,
          }}
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
        {/* 공유 버튼을 눌러야 쓰이므로, 화면이 다 뜬 뒤 한가할 때 받습니다(lazyOnload) — 첫 화면과 경쟁하지 않게. */}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          strategy="lazyOnload"
        />
        <AuthProvider>
          <AuthGuard />
          <AnalyticsTracker />
          <ErrorReporter />
          {children}
          {modal}
          <TabBar />
        </AuthProvider>
      </body>
    </html>
  );
}