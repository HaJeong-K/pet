"use client";

// 페이지별 첫 방문 안내 — 화면의 버튼·영역을 하나씩 밝게 짚으며 짧게 설명합니다.
// 한 번 보거나 "건너뛰기"를 누르면 그 페이지에서는 다시 뜨지 않습니다(브라우저에 기억).
// 지도·커뮤니티·입양·마이페이지·장소 상세가 같은 모양의 안내를 쓰도록 한 곳에 모았습니다.
// 단계는 CSS 선택자로 대상을 찾습니다 — 지금 화면에 보이지 않는 대상(휴대폰/PC 전용 버튼 등)은 자동으로 건너뜁니다.

import { useEffect, useRef, useState } from "react";

export type GuideStep = {
  /** 짚을 대상(CSS 선택자). 여러 개가 걸리면 화면에 보이는 첫 번째를 씁니다. */
  selector: string;
  title?: string;
  text: string;
};

type Props = {
  /** 이 안내를 봤는지 기억하는 이름(페이지마다 다르게) */
  storageKey: string;
  steps: GuideStep[];
  /** false인 동안에는 시작하지 않습니다(다른 팝업이 떠 있을 때 등) */
  enabled?: boolean;
  /** 화면이 다 그려질 시간을 주고 시작합니다 */
  delayMs?: number;
};

type Rect = { top: number; left: number; width: number; height: number };

// 설명 상자 폭 — 휴대폰은 고정 폭, PC는 글 길이에 맞춰 늘어납니다(문장이 한두 단어만 남기고 끊기지 않게).
const TIP_WIDTH_MOBILE = 250;
const TIP_MIN_WIDTH_DESKTOP = 300;
const TIP_MAX_WIDTH_DESKTOP = 540;
const DESKTOP_MIN_WIDTH = 768;
const GAP = 12;

function findVisible(selector: string): HTMLElement | null {
  let nodes: HTMLElement[] = [];
  try { nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)); } catch { return null; }
  return nodes.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }) ?? null;
}

export function hasSeenGuide(storageKey: string): boolean {
  try { return !!localStorage.getItem(storageKey); } catch { return true; }
}

export default function PageGuide({ storageKey, steps, enabled = true, delayMs = 900 }: Props) {
  // 실제로 보여줄 단계(화면에 대상이 있는 것만). null이면 안내를 띄우지 않습니다.
  const [active, setActive] = useState<GuideStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSize, setTipSize] = useState({ width: 300, height: 110 });
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current || hasSeenGuide(storageKey)) return;
    const timer = setTimeout(() => {
      const visible = steps.filter((s) => findVisible(s.selector));
      if (visible.length === 0) return; // 아직 대상이 없으면 다음 방문 때 다시 시도
      startedRef.current = true;
      setActive(visible);
      setIndex(0);
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey]);

  const finish = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* 저장 실패는 무시 */ }
    setActive(null);
    setRect(null);
  };

  const step = active?.[index] ?? null;

  useEffect(() => {
    if (!step) return;
    const el = findVisible(step.selector);
    if (!el) { // 그 사이 대상이 사라졌으면 다음 단계로
      if (active && index < active.length - 1) setIndex(index + 1); else finish();
      return;
    }
    const r0 = el.getBoundingClientRect();
    // 화면 밖에 있으면 보이는 자리로 옮깁니다 — 가로로 넘기는 줄(필터 등) 안에 숨어 있는 버튼도 포함
    if (r0.top < 0 || r0.bottom > window.innerHeight || r0.left < 0 || r0.right > window.innerWidth) {
      el.scrollIntoView({ block: "nearest", inline: "center" });
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    if (el.offsetWidth !== tipSize.width || el.offsetHeight !== tipSize.height) setTipSize({ width: el.offsetWidth, height: el.offsetHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rect]);

  if (!active || !step || !rect) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  // 화면보다 큰 대상(긴 목록 등)은 보이는 부분만 밝힙니다.
  const top = Math.max(6, rect.top - 4);
  const left = Math.max(6, rect.left - 4);
  const width = Math.min(vw - left - 6, rect.left + rect.width + 4 - left);
  const height = Math.min(vh - top - 6, rect.top + rect.height + 4 - top);
  // 설명 상자는 대상 아래에, 자리가 없으면 위에, 그것도 안 되면 화면 아래쪽에 둡니다.
  const below = top + height + GAP;
  const tipHeight = tipSize.height;
  const above = top - GAP - tipHeight;
  const tipTop = below + tipHeight <= vh - 8 ? below : above >= 8 ? above : Math.max(8, vh - tipHeight - 16);
  const wide = vw >= DESKTOP_MIN_WIDTH;
  const tipWidth = wide ? Math.min(tipSize.width, vw - 24) : Math.min(TIP_WIDTH_MOBILE, vw - 24);
  const tipLeft = Math.max(12, Math.min(left + width / 2 - tipWidth / 2, vw - tipWidth - 12));
  const last = index >= active.length - 1;

  return (
    <>
      {/* 어두운 배경 — 대상 부분만 뚫려 보입니다. 바깥을 누르면 건너뜁니다. */}
      <div
        onClick={finish}
        style={{
          position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.55)",
          // 대상 자리만 네모나게 뚫습니다(바깥 사각형 + 안쪽 사각형, evenodd).
          clipPath: `path(evenodd, "M0 0H${vw}V${vh}H0Z M${left} ${top}H${left + width}V${top + height}H${left}Z")`,
        }}
      />
      <div
        style={{
          position: "fixed", top, left, width, height, borderRadius: 12, zIndex: 3001, pointerEvents: "none",
          boxShadow: "0 0 0 3px white, 0 0 0 5px #3a7438",
          transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
        }}
      />
      <div
        ref={tipRef}
        role="dialog"
        aria-label="화면 안내"
        className="ggk-body"
        style={{
          position: "fixed", top: tipTop, left: tipLeft, zIndex: 3002,
          ...(wide
            ? { width: "max-content", minWidth: TIP_MIN_WIDTH_DESKTOP, maxWidth: Math.min(TIP_MAX_WIDTH_DESKTOP, vw - 24) }
            : { width: tipWidth }),
          background: "white", borderRadius: 14, padding: wide ? "16px 18px" : "13px 15px", wordBreak: "keep-all",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)", transition: "top 0.2s ease, left 0.2s ease",
        }}
      >
        {step.title && <div style={{ fontSize: wide ? 14.5 : 13, fontWeight: 800, color: "#1f1f1f", marginBottom: 4 }}>{step.title}</div>}
        <div style={{ fontSize: wide ? 13.5 : 12.5, color: "#444", lineHeight: 1.65, marginBottom: wide ? 14 : 11, whiteSpace: "pre-line" }}>{step.text}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={finish} style={{ border: "none", background: "transparent", color: "#999", fontSize: 11.5, cursor: "pointer", padding: "4px 0" }}>
            건너뛰기
          </button>
          <div style={{ display: "flex", gap: 4 }}>
            {active.map((_, i) => (
              <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === index ? "#3a7438" : "#ddd" }} />
            ))}
          </div>
          <button
            onClick={() => (last ? finish() : setIndex(index + 1))}
            style={{ border: "none", background: "#3a7438", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 8, cursor: "pointer" }}
          >
            {last ? "완료" : `다음 ${index + 1}/${active.length}`}
          </button>
        </div>
      </div>
    </>
  );
}
