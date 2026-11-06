// 탭 화면(숙소·쇼핑·커뮤니티·입양·주문 내역) 맨 위 머리말 — 모든 화면이 같은 구조·같은 높이·같은 글자 크기를 씁니다.
//   [작은 이름표] [오른쪽 버튼(선택)]
//   [제목]
//   [한 줄 설명]
// 검색창이 있는 화면은 머리말 바로 아래에 따로 놓습니다(children) — 2026-11-06 대표 결정: 머리말에 걸치면 답답해 보여서 분리.
//   머리말 높이는 검색창이 있든 없든 같습니다.
// 색은 2026-11-04에 고른 "차분한 캐러멜".

import type { ReactNode } from "react";

export const PAGE_HERO_BG = "linear-gradient(160deg,#8A5A3E 0%,#A0704F 100%)";

export default function PageHero({ eyebrow, title, desc, action, children }: {
  eyebrow: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  /** 오른쪽 위 작은 버튼(예: 보호소·후원) */
  action?: ReactNode;
  /** 머리말 바로 아래에 놓는 검색창 */
  children?: ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <style>{`
        /* 높이를 고정해 어느 화면이든 머리말 세로 길이가 같게 — 검색창이 걸치는 화면은 아래 여백만 넓힙니다 */
        .ggk-hero { height: 184px; padding: 22px clamp(18px, 4vw, 32px); }
        @media (max-width: 719px) { .ggk-hero { height: auto; min-height: 184px; } }
      `}</style>
      <header className="ggk-hero ggk-body" style={{ boxSizing: "border-box", background: PAGE_HERO_BG, color: "white", borderRadius: "0 0 26px 26px", wordBreak: "keep-all", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, height: 32 }}>
          <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,0.16)", color: "#FFF3EA", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.2px" }}>{eyebrow}</span>
          {action}
        </div>
        <h1 className="ggk-logo" style={{ margin: "12px 0 0", fontSize: "clamp(23px, 3.4vw, 28px)", fontWeight: 800, lineHeight: 1.32, letterSpacing: "-0.4px", color: "white" }}>{title}</h1>
        {desc && <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,0.92)" }}>{desc}</p>}
      </header>
      {children && (
        <div style={{ padding: "18px clamp(18px, 4vw, 32px) 12px" }}>{children}</div>
      )}
    </div>
  );
}

/** 머리말 아래 흰 검색창 틀 — 숙소·쇼핑이 같은 모양을 씁니다 */
export function HeroSearch({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderRadius: 14, background: "white", boxShadow: "0 1px 3px rgba(42,28,20,0.06)", border: "1.5px solid #E3DED9" }}>{children}</div>
  );
}
