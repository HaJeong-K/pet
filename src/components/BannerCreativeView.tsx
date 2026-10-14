"use client";

// 배너 광고 한 장을 그립니다 — 실제 광고 칸과 사장님 화면의 미리보기가 같은 그림을 씁니다(미리보기와 실제가 달라지지 않게).
//   shape "rail"  : PC 양옆 광고 칸(세로로 긴 카드, 사진 위에 문구)
//   shape "strip" : 휴대폰 한 줄 배너(작은 사진 + 문구)
// 글꼴은 사장님이 고른 것을 필요할 때만 받아 옵니다(src/lib/bannerCreative.ts의 BANNER_FONTS).

import { useEffect, type CSSProperties } from "react";
import { ChevronRight, Crown } from "lucide-react";
import { bannerFont, bannerFontScale, bannerFontsUrl, type BannerFontId } from "@/lib/bannerCreative";

export type BannerView = { name: string; headline: string; body: string | null; image: string | null; font: BannerFontId | string };

/** 그 글꼴들을 한 번만 받아 옵니다(이미 받아 둔 주소는 다시 붙이지 않음) */
export function useBannerFonts(ids: (string | null | undefined)[]) {
  const url = bannerFontsUrl(ids);
  useEffect(() => {
    if (!url || document.querySelector(`link[data-banner-fonts="${url}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.bannerFonts = url;
    document.head.appendChild(link);
  }, [url]);
}

const adBadge: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999, fontSize: 9, fontWeight: 800,
  background: "linear-gradient(135deg,#F0D28A,#D4A24C)", color: "#5C4106", flexShrink: 0, fontFamily: "'Noto Sans KR', sans-serif",
};
const clamp = (lines: number): CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });

export default function BannerCreativeView({ banner, shape, onClick, style }: { banner: BannerView; shape: "rail" | "strip"; onClick?: () => void; style?: CSSProperties }) {
  useBannerFonts([banner.font]);
  const font = bannerFont(banner.font);
  const scale = bannerFontScale(banner.font);
  const headlineFont: CSSProperties = { fontFamily: font.family, fontWeight: font.weight };
  // 기본 그림(가게 사진이 없을 때 들어가는 로고)은 배경으로 쓰기엔 어울리지 않아 사진이 없는 것으로 봅니다.
  const photo = banner.image && !banner.image.includes("default-place") ? banner.image : null;

  if (shape === "strip") {
    return (
      <button
        onClick={onClick}
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
          padding: "9px 14px", border: "none", borderBottom: "1px solid #F3E3BC", background: "#FFFBEB", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", ...style,
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ width: 46, height: 46, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...headlineFont, display: "block", fontSize: 14 * scale, lineHeight: 1.25, color: "#3D2C05", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{banner.headline}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, minWidth: 0 }}>
            <span style={adBadge}><Crown size={8} />AD</span>
            <span style={{ fontSize: 11, color: "#8A6D1F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{banner.body ? `${banner.body} · ${banner.name}` : banner.name}</span>
          </span>
        </span>
        <ChevronRight size={16} color="#B58A2A" style={{ flexShrink: 0 }} />
      </button>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, minHeight: 0, borderRadius: 16, overflow: "hidden", cursor: onClick ? "pointer" : "default",
        position: "relative", display: "flex", flexDirection: "column",
        border: "1px solid rgba(212,162,76,0.35)",
        background: photo ? `url("${photo}") center/cover no-repeat` : "linear-gradient(160deg,#FFF6E3 0%,#FFE3B0 60%,#F6C98A 100%)",
        ...style,
      }}
    >
      <div style={{ ...adBadge, position: "absolute", top: 7, left: 7 }}><Crown size={8} />AD</div>
      <div style={{
        marginTop: "auto", padding: photo ? "34px 11px 11px" : "11px",
        background: photo ? "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)" : "transparent",
      }}>
        <div style={{ ...headlineFont, ...clamp(3), fontSize: 16 * scale, lineHeight: 1.28, color: photo ? "white" : "#4A3306", wordBreak: "keep-all", textShadow: photo ? "0 1px 6px rgba(0,0,0,0.45)" : "none" }}>
          {banner.headline}
        </div>
        {banner.body && (
          <div style={{ ...clamp(3), marginTop: 5, fontSize: 11.5, lineHeight: 1.45, color: photo ? "rgba(255,255,255,0.92)" : "#6B4E12", wordBreak: "keep-all" }}>{banner.body}</div>
        )}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: photo ? "rgba(255,255,255,0.85)" : "#8A6D1F" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{banner.name}</span>
          <ChevronRight size={11} style={{ flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
