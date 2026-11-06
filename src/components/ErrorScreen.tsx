// src/components/ErrorScreen.tsx
//
// 오류 화면 — 화면 일부가 망가졌을 때(error.tsx)와 사이트 뼈대까지 망가졌을 때(global-error.tsx)가 함께 씁니다.
// global-error에서는 사이트 공통 스타일이 없을 수 있어, 글꼴·색을 모두 이 파일 안에 직접 적어 둡니다.
// 구성은 여기어때·당근·노션의 오류 화면처럼 흰 바탕에 왼쪽 위 로고, 가운데 제목·안내 한 줄·버튼 하나입니다.

import { SchnauzerHead } from "@/components/brand/SchnauzerPeek";
import BrandLogo from "@/components/brand/BrandLogo";

const DARK = "#3B2A20";
const SUB = "#6B5E55";
const FONT = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";

export default function ErrorScreen({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 화면 자체를 스크롤 영역으로 둡니다.
    <main
      style={{
        boxSizing: "border-box", height: "100dvh", overflowY: "auto", background: "white", color: DARK,
        fontFamily: FONT, wordBreak: "keep-all", display: "flex", flexDirection: "column",
        padding: "0 20px calc(24px + var(--ggk-tabbar-space, 0px))",
      }}
    >
      <header style={{ flexShrink: 0, height: 64, display: "flex", alignItems: "center" }}>
        {/* 앱 상태가 망가졌을 수 있어 화면 이동이 아니라 처음부터 새로 엽니다 */}
        <a href="/" aria-label="펫츠로드 지도" style={{ display: "block" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 오류 중에는 이미지 최적화 서버도 실패할 수 있어 원본을 바로 씁니다 */}
          <BrandLogo height={34} />
        </a>
      </header>

      <div style={{ margin: "auto", paddingBottom: 40, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <SchnauzerHead width={84} />
        <h1 style={{ margin: "22px 0 0", fontSize: 22, lineHeight: 1.4, fontWeight: 800, color: DARK }}>{title}</h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, color: SUB }}>잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 24, width: 200, padding: 14, borderRadius: 12, border: "none",
            background: DARK, color: "white", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          다시 시도
        </button>
        <a href="/" style={{ marginTop: 14, padding: 4, fontSize: 14, fontWeight: 600, color: SUB, textDecoration: "underline", textUnderlineOffset: 3 }}>
          지도로 돌아가기
        </a>
      </div>
    </main>
  );
}
