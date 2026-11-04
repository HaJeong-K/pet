"use client";

// 시각 고르기 — 브라우저 기본 시계 입력(type="time") 대신 씁니다.
// 기본 시계 입력은 휴대폰·PC마다 모양이 다르고, 오전·오후와 분을 따로 돌려야 해서 "00분"을 고르기도 번거로웠습니다.
// 30분 단위 목록에서 한 번에 고르고, 목록에 없는 시각(예: 14:10)은 [직접 입력]으로 숫자만 쳐서 넣습니다.
// 값은 "HH:MM"(24시간) 문자열, 비우면 "".

import { useState } from "react";

const CUSTOM = "__custom";
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "14:30" → "오후 2:30" */
export function timeLabel(t: string): string {
  const min = toMin(t);
  if (min == null) return t;
  const h = Math.floor(min / 60), m = min % 60;
  const half = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${String(m).padStart(2, "0")}`;
}

/** 숫자만 친 것을 "HH:MM"으로 — "1410" → "14:10", "930" → "09:30". 시각이 아니면 null */
export function parseTyped(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length < 3 || d.length > 4) return null;
  const h = Number(d.slice(0, d.length - 2)), m = Number(d.slice(-2));
  return h <= 23 && m <= 59 ? toTime(h * 60 + m) : null;
}

export default function TimePicker({ value, onChange, min = "00:00", max = "23:59", step = 30, emptyLabel, ariaLabel, disabled, style }: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** 목록 간격(분) */
  step?: number;
  /** 있으면 맨 위에 "비워 두기" 칸(선택 입력) */
  emptyLabel?: string;
  ariaLabel: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const lo = toMin(min) ?? 0, hi = toMin(max) ?? 1439;
  const slots: string[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) slots.push(toTime(t));
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const typedOk = parseTyped(typed);
  const typedInRange = typedOk != null && toMin(typedOk)! >= lo && toMin(typedOk)! <= (toMin(max) ?? 1439);

  const box: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #D9D8D7", fontSize: 14.5, fontWeight: 700, color: "#1f1a12", background: "white", fontFamily: "inherit", boxSizing: "border-box", minHeight: 44 };

  if (typing) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", ...style }}>
        <input
          autoFocus value={typed} inputMode="numeric" maxLength={5} placeholder="예: 1410 → 14:10" aria-label={`${ariaLabel} 직접 입력`} disabled={disabled}
          onChange={(e) => { const v = e.target.value.replace(/[^\d:]/g, ""); setTyped(v); const t = parseTyped(v); if (t && toMin(t)! >= lo && toMin(t)! <= (toMin(max) ?? 1439)) onChange(t); }}
          style={{ ...box, width: 150 }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: typed && !typedInRange ? "#B42318" : "#3B2A20" }}>
          {typedOk ? (typedInRange ? timeLabel(typedOk) : `${timeLabel(min)}~${timeLabel(max)} 사이로 적어 주세요`) : "숫자 4자리로 적어 주세요"}
        </span>
        <button type="button" onClick={() => setTyping(false)} style={{ border: "none", background: "transparent", padding: "4px 2px", color: "#6B5E55", fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>목록에서 고르기</button>
      </div>
    );
  }
  const inList = !value || slots.includes(value);
  return (
    <select
      value={value || ""} disabled={disabled} aria-label={ariaLabel}
      onChange={(e) => { if (e.target.value === CUSTOM) { setTyped(value ? value.replace(":", "") : ""); setTyping(true); return; } onChange(e.target.value); }}
      style={{ ...box, width: 170, cursor: disabled ? "default" : "pointer", ...style }}
    >
      {emptyLabel != null ? <option value="">{emptyLabel}</option> : !value && <option value="" disabled>시간을 골라 주세요</option>}
      {!inList && <option value={value}>{timeLabel(value)}</option>}
      {slots.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
      <option value={CUSTOM}>직접 입력…</option>
    </select>
  );
}
