"use client";

// 가입 화면 공통 틀(일반 회원 /signup, 사장님 /signup-owner)
//   · 넓은 화면: 왼쪽 브랜드 칸(이용할 수 있는 서비스) + 오른쪽 입력 칸
//   · 휴대폰: 위쪽 짧은 브랜드 띠 + 입력 칸
// 입력 카드 위로 슈나우저 두 마리가 내다봅니다. 입력 칸의 테두리·포커스 모양도 여기서 통일합니다(.ggk-join).
// 색은 화면마다 다릅니다(JOIN_THEMES): 일반 회원 = 오트밀 + 머스터드, 사장님 = 크림 + 로고 브라운(가입 버튼만 검정).
// 안쪽 입력 폼의 버튼·체크 색은 CSS 변수(--join-btn 등)로 받아 씁니다.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, X, type LucideIcon } from "lucide-react";
import { closeModal } from "@/lib/closeModal";
import { PEEK_SPACE, PeekingDogs } from "@/components/brand/SchnauzerPeek";

export type JoinPoint = { Icon: LucideIcon; title: string; text: string };

type JoinTheme = {
  page: string; band: string; ink: string; muted: string; accent: string;
  free: string; freeInk: string; chip: string; chipLine: string; chipInk: string;
  iconBox: string; iconLine: string; label: string; labelLine: string; labelInk: string;
  btn: string; strong: string; focus: string; focusRing: string; soft: string; softLine: string; softInk: string;
  field: string; cardLine: string; shadow: string;
};

export const JOIN_THEMES: Record<"oat" | "cream", JoinTheme> = {
  // 일반 회원 — 오트밀 + 머스터드
  oat: {
    page: "#FAF8F3", band: "#F1EADB", ink: "#3D3426", muted: "#5C5243", accent: "#B98A1F",
    free: "#E8B64A", freeInk: "#3D2E0A", chip: "rgba(61,52,38,0.05)", chipLine: "rgba(61,52,38,0.12)", chipInk: "#4E4332",
    iconBox: "#FFFFFF", iconLine: "#E5DCC8", label: "#F3EDE0", labelLine: "#E6DCC6", labelInk: "#5C4A22",
    btn: "#3D3426", strong: "#3D3426", focus: "#B98A1F", focusRing: "rgba(185,138,31,0.18)", soft: "#FBF6EA", softLine: "#EADFC6", softInk: "#6B5525",
    field: "#E7E1D4", cardLine: "#ECE6D8", shadow: "rgba(61,52,38,0.10)",
  },
  // 사장님 — 크림 + 로고 브라운(주변 평가로 고른 A안). 가입하기 버튼만 검정
  cream: {
    page: "#FBF7F1", band: "#EFE2D0", ink: "#4A3021", muted: "#5F4D3A", accent: "#A0663A",
    free: "#8C5E3A", freeInk: "#FFF8EE", chip: "rgba(74,48,33,0.05)", chipLine: "rgba(74,48,33,0.14)", chipInk: "#6B4426",
    iconBox: "#FFFFFF", iconLine: "#E6D6C0", label: "#F3E7D8", labelLine: "#E6D6C0", labelInk: "#6B4426",
    btn: "#111111", strong: "#8C5E3A", focus: "#A0663A", focusRing: "rgba(160,102,58,0.18)", soft: "#FBF3E7", softLine: "#EBDDC9", softInk: "#6B4426",
    field: "#E8DFD2", cardLine: "#EFE6DA", shadow: "rgba(74,48,33,0.10)",
  },
};

export default function JoinLayout({ theme = "oat", eyebrow, EyebrowIcon, heading, highlights = [], points, footnote, label, title, sub, children }: {
  theme?: keyof typeof JOIN_THEMES;
  eyebrow: string;
  EyebrowIcon: LucideIcon;
  heading: [string, string];
  /** 제목 바로 아래 눈에 띄게 보여 줄 문구(휴대폰에서도 보임). 첫 번째는 강조색 */
  highlights?: string[];
  points: JoinPoint[];
  footnote?: ReactNode;
  label: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = JOIN_THEMES[theme];
  // 안쪽 입력 폼이 쓰는 색(버튼·체크·보조 버튼)
  const vars = {
    "--join-btn": t.btn, "--join-strong": t.strong, "--join-soft": t.soft, "--join-soft-line": t.softLine, "--join-soft-ink": t.softInk,
  } as CSSProperties;
  return (
    <div className="ggk-body ggk-join" style={{ ...vars, height: "100dvh", overflowY: "auto", background: t.page, color: "#23201B", wordBreak: "keep-all" }}>
      <style>{`
        .ggk-join-grid { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100%; }
        .ggk-join-brand { padding: 22px 22px 26px; }
        .ggk-join-brand .points { display: none; }
        @media (min-width: 980px) {
          .ggk-join-grid { grid-template-columns: minmax(380px, 42%) minmax(0, 1fr); }
          .ggk-join-brand { position: sticky; top: 0; height: 100dvh; padding: 44px 48px; display: flex; flex-direction: column; box-sizing: border-box; overflow-y: auto; }
          .ggk-join-brand .points { display: grid; }
        }
        .ggk-join input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), .ggk-join select, .ggk-join textarea {
          border: 1px solid ${t.field} !important; background: #FFFFFF !important; border-radius: 12px !important; font-family: inherit;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .ggk-join input:not([type="checkbox"]):not([type="radio"]):focus, .ggk-join select:focus, .ggk-join textarea:focus {
          outline: none; border-color: ${t.focus} !important; box-shadow: 0 0 0 4px ${t.focusRing};
        }
        .ggk-join-close { position: fixed; top: 16px; right: 16px; z-index: 50; width: 42px; height: 42px; border-radius: 999px; border: 1px solid ${t.field}; background: rgba(255,255,255,0.95); color: ${t.ink}; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.08); transition: background .15s ease; }
        .ggk-join-close:hover { background: ${t.band}; }
        .ggk-join input[type="checkbox"] { accent-color: ${t.strong}; width: 17px; height: 17px; }
      `}</style>
      {/* 닫기 — 잘못 들어온 경우 이전 화면으로(이전 화면이 없으면 지도로) */}
      <button type="button" onClick={() => closeModal(router)} aria-label="닫기" className="ggk-join-close">
        <X size={20} />
      </button>
      <div className="ggk-join-grid">
        {/* 왼쪽(휴대폰은 위) 브랜드 칸 */}
        <aside className="ggk-join-brand" style={{ background: t.band, color: t.ink }}>
          <Link href="/" aria-label="같이가개 지도" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 12, background: "#FFFFFF", border: `1px solid ${t.chipLine}` }}>
            <Image src="/icons/logo_lockup.png" alt="같이가개" width={721} height={231} style={{ height: 28, width: "auto" }} priority />
          </Link>
          <div style={{ marginTop: "clamp(18px, 6vh, 64px)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "#FFFFFF", border: `1px solid ${t.chipLine}`, color: t.chipInk, fontSize: 12.5, fontWeight: 700 }}>
              <EyebrowIcon size={13} />{eyebrow}
            </div>
            <h1 className="ggk-logo" style={{ margin: "14px 0 0", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.5px" }}>
              {heading[0]}<br /><span style={{ color: t.accent }}>{heading[1]}</span>
            </h1>
            {highlights.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
                {highlights.map((h, i) => (
                  <span key={h} style={i === 0
                    ? { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 10, background: t.free, color: t.freeInk, fontSize: 14, fontWeight: 800 }
                    : { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, background: t.chip, border: `1px solid ${t.chipLine}`, color: t.chipInk, fontSize: 12.5, fontWeight: 700 }}>
                    <Check size={i === 0 ? 15 : 13} strokeWidth={3} />{h}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="points" style={{ gap: 18, marginTop: 40 }}>
            {points.map(({ Icon, title: pt, text }) => (
              <div key={pt} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: t.iconBox, border: `1px solid ${t.iconLine}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} color={t.accent} /></span>
                <span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{pt}</span>
                  <span style={{ display: "block", fontSize: 13, color: t.muted, marginTop: 3, lineHeight: 1.65 }}>{text}</span>
                </span>
              </div>
            ))}
          </div>
          {footnote && (
            <div className="points" style={{ marginTop: "auto", paddingTop: 28, fontSize: 12, color: t.muted, lineHeight: 1.7 }}>
              {footnote}
            </div>
          )}
        </aside>

        {/* 오른쪽 입력 칸 */}
        <main style={{ padding: "clamp(28px, 5vw, 56px) clamp(16px, 4vw, 48px) 48px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 580 }}>
            {/* 화면 이름 뱃지 — 제목과 같은 글자체 */}
            <div className="ggk-logo" style={{ display: "inline-flex", alignItems: "center", padding: "7px 13px", borderRadius: 11, background: t.label, border: `1px solid ${t.labelLine}`, color: t.labelInk, fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.2px" }}>
              {label}
            </div>
            <h2 className="ggk-logo" style={{ margin: "12px 0 0", fontSize: "clamp(22px, 2.6vw, 28px)", fontWeight: 800, letterSpacing: "-0.4px", color: t.ink }}>{title}</h2>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: t.muted }}>{sub}</p>

            {/* 입력 카드 — 슈나우저 두 마리가 카드 위로 살짝 내다봅니다(얼굴은 카드 뒤, 앞발은 카드 앞) */}
            <div style={{ position: "relative", marginTop: PEEK_SPACE }}>
              <PeekingDogs />
              <div style={{ position: "relative", zIndex: 1, background: "white", borderRadius: 24, border: `1px solid ${t.cardLine}`, boxShadow: `0 20px 50px ${t.shadow}, 0 2px 8px rgba(0,0,0,0.04)`, padding: "clamp(22px, 4vw, 34px)" }}>
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
