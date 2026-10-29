"use client";

// 숙소 화면들(숙소 탭 /stay, 숙소 화면 /stay/번호, 예약 /stay/번호/book)과 쇼핑 탭(/shop)의 바깥 틀 —
// 커뮤니티·마이페이지와 같은 3단 구성: [왼쪽 광고 칸] [본문(최대 1000px)] [오른쪽 보호소 공고 칸]
// 좌우 칸(SideAdRail)은 넓은 가로 화면에서만 보이고, 휴대폰에서는 본문만 꽉 차게 보입니다.
// 본문 칸이 세로로 스크롤되고, 아래 여백은 하단 탭바 높이(--ggk-tabbar-space)만큼 둡니다.

import type { ReactNode } from "react";
import { AdRailLeft, AdRailRight } from "@/components/SideAdRail";

export default function StayFrame({ children, background = "#F7F3E8" }: { children: ReactNode; background?: string }) {
  return (
    <div
      className="ggk-body"
      style={{
        height: "100dvh",
        background,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) min(1000px, 100%) minmax(0, 1fr)",
        // 좁은 화면(1000px+간격 미만)에서는 칸 간격을 0으로 — 16px×2가 남으면 본문이 오른쪽으로 잘립니다.
        columnGap: "clamp(0px, calc((100vw - 1032px) / 2), 16px)",
      }}
    >
      <AdRailLeft />
      {/* 가운데 칸 고정 — 좌우 레일이 숨겨진 화면에서 본문이 폭 0인 첫 칸으로 밀리지 않게 */}
      <div style={{ gridColumn: "2", minWidth: 0, height: "100dvh", overflowY: "auto", scrollbarWidth: "thin" }}>
        <div style={{ paddingBottom: "var(--ggk-tabbar-space)", wordBreak: "keep-all" }}>{children}</div>
      </div>
      <AdRailRight rightMode="shelter" />
    </div>
  );
}
