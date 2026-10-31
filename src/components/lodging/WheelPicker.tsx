"use client";

// 끌어서 고르는 선택창 — 휴대폰 알람 시간처럼 위아래로 밀면 가운데 칸이 선택됩니다. 마우스로 끌어도 됩니다.
// 항목을 눌러도 그 칸으로 움직입니다. 키보드는 화살표 위아래.

import { useCallback, useEffect, useRef } from "react";

const ROW = 40;
const VISIBLE = 5;

export default function WheelPicker({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const latest = useRef({ options, value, onChange });
  useEffect(() => { latest.current = { options, value, onChange }; });

  const indexOfValue = options.findIndex((o) => o.value === value);
  const selected = Math.max(0, indexOfValue);

  const moveTo = useCallback((index: number, smooth = true) => {
    box.current?.scrollTo({ top: index * ROW, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // 값이나 목록(검색)이 바뀌면 그 칸으로 맞춥니다
  useEffect(() => {
    const el = box.current;
    if (el && Math.round(el.scrollTop / ROW) !== selected) moveTo(selected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, options.length]);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = box.current;
      if (!el || drag.current) return;
      const { options: list, value: current, onChange: change } = latest.current;
      const next = list[Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ROW)))];
      if (next && next.value !== current) change(next.value);
    }, 110);
  };

  return (
    <div style={{ position: "relative", height: ROW * VISIBLE, borderRadius: 12, background: "white", border: "1px solid #e5e2d8", overflow: "hidden" }}>
      {/* 가운데 선택 칸 */}
      <div aria-hidden style={{ position: "absolute", left: 6, right: 6, top: ROW * 2, height: ROW, borderRadius: 9, background: "#EEF3E8", pointerEvents: "none" }} />
      <div
        ref={box}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const next = options[Math.max(0, Math.min(options.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1)))];
          if (next) onChange(next.value);
        }}
        onPointerDown={(e) => {
          // 마우스는 끌어서 움직입니다(손가락은 브라우저 스크롤을 그대로 씁니다)
          if (e.pointerType !== "mouse" || !box.current) return;
          drag.current = { y: e.clientY, top: box.current.scrollTop, moved: false };
          box.current.style.scrollSnapType = "none";
        }}
        onPointerMove={(e) => {
          if (!drag.current || !box.current) return;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dy) > 3) drag.current.moved = true;
          box.current.scrollTop = drag.current.top - dy;
        }}
        onPointerUp={() => {
          const el = box.current;
          if (!drag.current || !el) return;
          drag.current = null;
          el.style.scrollSnapType = "y mandatory";
          moveTo(Math.round(el.scrollTop / ROW));
          onScroll();
        }}
        onPointerLeave={() => {
          const el = box.current;
          if (!drag.current || !el) return;
          drag.current = null;
          el.style.scrollSnapType = "y mandatory";
          moveTo(Math.round(el.scrollTop / ROW));
          onScroll();
        }}
        style={{ position: "relative", height: "100%", overflowY: "auto", overflowX: "hidden", scrollSnapType: "y mandatory", scrollbarWidth: "none", overscrollBehavior: "contain", cursor: "grab", userSelect: "none", outline: "none", touchAction: "pan-y" }}
      >
        <div style={{ height: ROW * 2 }} />
        {options.map((o, i) => {
          const on = i === selected;
          return (
            <div
              key={o.value}
              role="option"
              aria-selected={on}
              onClick={() => { moveTo(i); if (!on) onChange(o.value); }}
              style={{ height: ROW, display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "center", fontSize: on ? 15 : 13.5, fontWeight: on ? 800 : 500, color: on ? "#2F3B28" : "#6b6b6b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 12px" }}
            >
              {o.label}
            </div>
          );
        })}
        <div style={{ height: ROW * 2 }} />
      </div>
      {/* 위아래가 흐려져 더 있다는 것을 보여 줍니다 */}
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: ROW * 1.5, background: "linear-gradient(white, rgba(255,255,255,0))", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: ROW * 1.5, background: "linear-gradient(rgba(255,255,255,0), white)", pointerEvents: "none" }} />
    </div>
  );
}
