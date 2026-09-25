"use client";

import dynamic from "next/dynamic";

// ⚠ 최적화: KakaoMap.tsx는 3,400줄 이상(지도·리스트·AI 코스 추천·사장님 등록 폼 등)을
// 한 컴포넌트에 담고 있어서, page.tsx가 이 파일을 정적으로 import하면 그 전체가
// 첫 페이지 로드의 메인 JS 청크에 그대로 포함됩니다. next/dynamic으로 불러오면
// 웹팩이 별도 청크로 분리해서, 최소한 이 청크를 내려받는 동안에는 흰 화면 대신
// 아래 스켈레톤을 먼저 보여줄 수 있습니다(체감 로딩 개선).
const KakaoMap = dynamic(() => import("@/components/KakaoMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#f5f6f8",
      }}
    >
      <div
        style={{
          height: "72px",
          flexShrink: 0,
          background: "white",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
        }}
      >
        <div
          className="ggk-skeleton-pulse"
          style={{ width: "120px", height: "36px", borderRadius: "8px", background: "#eceef1" }}
        />
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div
          className="ggk-skeleton-pulse"
          style={{ position: "absolute", inset: 0, background: "#e9ebee" }}
        />
      </div>
      <style>{`
        .ggk-skeleton-pulse {
          animation: ggk-pulse 1.4s ease-in-out infinite;
        }
        @keyframes ggk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default KakaoMap;
