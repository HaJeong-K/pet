// src/components/LevelBadge.tsx
//
// 회원 레벨 배지 — 닉네임 옆(작게)과 마이페이지(크게)에서 함께 씁니다.
// 단계 이름·색은 src/lib/memberLevel.ts의 MEMBER_LEVELS를 그대로 씁니다.
import { MEMBER_LEVELS } from "@/lib/memberLevel";

export default function LevelBadge({ level, size = "small", onDark = false }: {
  /** 단계 번호(1~6). 없거나 범위를 벗어나면 아무것도 그리지 않습니다 */
  level: number | null | undefined;
  size?: "small" | "large";
  /** 어두운 바탕(마이페이지 초록 배너) 위에 올릴 때 — 흰 테두리를 둡니다 */
  onDark?: boolean;
}) {
  const info = level != null ? MEMBER_LEVELS[Math.round(level) - 1] : undefined;
  if (!info) return null;
  const large = size === "large";
  return (
    <span
      data-level-badge={info.level}
      title={`${info.level}단계 · ${info.name} — ${info.description}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: large ? 5 : 3, flexShrink: 0, whiteSpace: "nowrap",
        fontSize: large ? 12 : 10, fontWeight: 700, lineHeight: 1,
        padding: large ? "5px 10px" : "2px 6px", borderRadius: 999,
        color: info.color, background: info.background,
        border: onDark ? "1px solid rgba(255,255,255,0.7)" : "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <span style={{ fontSize: large ? 11 : 9, opacity: 0.75 }}>Lv.{info.level}</span>
      {info.name}
    </span>
  );
}
