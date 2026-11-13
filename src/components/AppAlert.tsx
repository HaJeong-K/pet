"use client";

// 안내 창 통일 — 2026-11-13
// 화면 곳곳(140여 곳)에서 쓰는 브라우저 기본 알림창(alert)은 기기마다 모양이 다르고 주소가 함께 떠서 어색했습니다.
// 여기서 window.alert를 펫츠로드 안내 창으로 바꿔, 코드를 하나하나 고치지 않고도 모든 안내가 같은 모양으로 뜹니다.
//   · 짧은 안내(한 줄, 40자 이하)는 아래에 잠깐 떴다 사라지는 띠로,
//   · 긴 안내·여러 줄은 [확인]을 눌러 닫는 창으로 보여 줍니다.
//   · 안내 직후 페이지를 새로 불러오는 곳(가입 완료 → 이동 등)에서도 안내가 사라지지 않게,
//     방금 띄운 안내를 잠깐 기억했다가 새 페이지에서 이어 보여 줍니다.
// ⚠ 기본 alert와 달리 화면을 멈추지 않습니다(안내를 띄운 뒤 다음 코드가 바로 이어짐). 예/아니오를 묻는 confirm·prompt는 그대로입니다.

import { useEffect, useRef, useState } from "react";

type Notice = { id: number; text: string };

const CARRY_KEY = "ggk-alert";
const CARRY_MS = 6000;
const TOAST_MS = 2600;
const NEWLINE = String.fromCharCode(10);

function remember(text: string | null) {
  try {
    if (text) sessionStorage.setItem(CARRY_KEY, JSON.stringify({ text, t: Date.now() }));
    else sessionStorage.removeItem(CARRY_KEY);
  } catch { /* 저장소를 못 쓰는 경우 */ }
}

export default function AppAlert() {
  const [toast, setToast] = useState<Notice | null>(null);
  const [dialogs, setDialogs] = useState<Notice[]>([]);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const native = window.alert;
    const show = (text: string) => {
      const id = ++seq.current;
      remember(text);
      if (text.length <= 40 && !text.includes(NEWLINE)) {
        setToast({ id, text });
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { setToast(null); remember(null); }, TOAST_MS);
      } else {
        setDialogs((list) => [...list, { id, text }]);
      }
    };
    window.alert = (message?: unknown) => {
      const text = String(message ?? "").trim();
      if (text) show(text);
    };
    // 직전 페이지에서 띄운 안내가 새로 고침으로 끊겼으면 이어서 보여 줍니다.
    try {
      const carried = JSON.parse(sessionStorage.getItem(CARRY_KEY) || "null") as { text?: string; t?: number } | null;
      if (carried?.text && Date.now() - (carried.t ?? 0) < CARRY_MS) show(carried.text);
      else remember(null);
    } catch { /* 무시 */ }
    return () => { window.alert = native; if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  const current = dialogs[0] ?? null;
  useEffect(() => { if (current) okRef.current?.focus(); }, [current]);
  const close = () => { remember(null); setDialogs((list) => list.slice(1)); };

  return (
    <>
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: "calc(110px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 10200, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 999, background: "rgba(42,28,20,0.94)", color: "white", fontSize: 14, fontWeight: 700, lineHeight: 1.45, textAlign: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.22)", pointerEvents: "none" }}>
          {toast.text}
        </div>
      )}
      {current && (
        <div role="alertdialog" aria-modal="true" aria-label="안내" onClick={close} onKeyDown={(e) => { if (e.key === "Escape") close(); }} style={{ position: "fixed", inset: 0, zIndex: 10210, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(360px, 100%)", background: "white", borderRadius: 18, padding: "22px 20px 16px", boxShadow: "0 18px 44px rgba(42,28,20,0.25)" }}>
            <div style={{ fontSize: 14.5, color: "#1F1A16", lineHeight: 1.7, whiteSpace: "pre-line", wordBreak: "keep-all", maxHeight: "50vh", overflowY: "auto" }}>{current.text}</div>
            <button ref={okRef} onClick={close} style={{ marginTop: 18, width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#3B2A20", color: "white", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              확인{dialogs.length > 1 ? ` (${dialogs.length - 1}개 더)` : ""}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
