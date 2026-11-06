"use client";

// 커뮤니티 게시판 고르기(2026-11-06 대표 결정 — PC는 시안 A, 휴대폰은 시안 E)
//   · BoardScroller(PC): 한 줄로 늘어놓고, 넘칠 때만 양 끝을 흐리게 하고 ‹ › 버튼으로 넘겨 봅니다(가려진 게시판이 있다는 표시).
//   · BoardPickerMobile(휴대폰): 지금 게시판 이름을 크게 보여 주고 [바꾸기]로 전체 목록 창(설명 포함)을 엽니다.
//     자주 쓰는 전체·인기·공지는 아래 빠른 이동 칩으로 바로 누를 수 있습니다.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, X } from "lucide-react";

export function BoardScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const t = window.setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [measure]);
  const go = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * Math.max(160, (ref.current.clientWidth ?? 300) * 0.6), behavior: "smooth" });
  const arrow = (dir: -1 | 1): React.CSSProperties => ({
    position: "absolute", top: "50%", transform: "translateY(-50%)", [dir < 0 ? "left" : "right"]: 0, zIndex: 2,
    width: 30, height: 30, borderRadius: "50%", border: "1px solid #DDDCDB", background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, color: "#2A1C14",
  });
  const fade = (dir: -1 | 1): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 0, [dir < 0 ? "left" : "right"]: 22, width: 36, zIndex: 1, pointerEvents: "none",
    background: `linear-gradient(${dir < 0 ? "270deg" : "90deg"}, rgba(255,255,255,0), #fff)`,
  });
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <style>{`.ggk-board-strip::-webkit-scrollbar { display: none; }`}</style>
      <div ref={ref} onScroll={measure} className="ggk-board-strip" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: `0 ${edge.right ? 34 : 0}px 0 ${edge.left ? 34 : 0}px` }}>
        {children}
      </div>
      {edge.left && <><span aria-hidden style={fade(-1)} /><button type="button" onClick={() => go(-1)} aria-label="앞쪽 게시판 보기" style={arrow(-1)}><ChevronLeft size={16} /></button></>}
      {edge.right && <><span aria-hidden style={fade(1)} /><button type="button" onClick={() => go(1)} aria-label="뒤쪽 게시판 더 보기" style={arrow(1)}><ChevronRight size={16} /></button></>}
    </div>
  );
}

export type BoardItem = { id: string; label: string; desc?: string; tone?: "hot" | "biz" };

export function BoardPickerMobile({ groups, active, activeLabel, quick, onPick }: {
  groups: { title: string; boards: BoardItem[] }[];
  active: string;
  activeLabel: string;
  /** 빠른 이동 칩(전체·인기·공지) */
  quick: BoardItem[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  const pick = (id: string) => { onPick(id); setOpen(false); };
  const chip = (b: BoardItem) => {
    const on = b.id === active;
    return (
      <button key={b.id} type="button" onClick={() => onPick(b.id)} aria-pressed={on} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 10, border: on ? "none" : "1px solid rgba(0,0,0,0.08)", background: on ? (b.tone === "hot" ? "#D9534F" : "#A05A32") : "white", color: on ? "white" : b.tone === "hot" ? "#c9302c" : "#1a1a1a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{b.label}</button>
    );
  };
  return (
    <div style={{ width: "100%", display: "grid", gap: 8 }}>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid #3B2A20", background: "white", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <ClipboardList size={17} color="#A05A32" />
        <b style={{ flex: 1, minWidth: 0, fontSize: 15, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</b>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 13, fontWeight: 800, color: "#3B2A20" }}>바꾸기<ChevronDown size={15} /></span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {quick.map(chip)}
        <span style={{ fontSize: 12, color: "#4A3F38", marginLeft: 2 }}>빠른 이동</span>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div role="dialog" aria-modal="true" aria-label="게시판 고르기" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10060, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="ggk-body" style={{ width: "100%", maxWidth: 520, maxHeight: "82dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "16px 16px calc(24px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", wordBreak: "keep-all" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <b style={{ flex: 1, fontSize: 17, color: "#111" }}>게시판 고르기</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#F4F3F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
            </div>
            {groups.map((g) => (
              <div key={g.title} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#4A3F38", marginBottom: 6 }}>{g.title}</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {g.boards.map((b) => {
                    const on = b.id === active;
                    return (
                      <button key={b.id} type="button" onClick={() => pick(b.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, border: `1px solid ${on ? "#A05A32" : "#EDECEB"}`, background: on ? "#FFF8F3" : b.tone === "biz" ? "#FFFBEB" : "white", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: b.tone === "hot" ? "#c9302c" : b.tone === "biz" ? "#92400e" : "#111" }}>{b.label}</span>
                          {b.desc && <span style={{ display: "block", fontSize: 12.5, color: "#2A1C14", marginTop: 2, lineHeight: 1.5 }}>{b.desc}</span>}
                        </span>
                        {on && <Check size={16} color="#A05A32" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
