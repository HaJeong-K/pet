// src/components/LogoLoader.tsx
//
// 불러오는 동안 보여 주는 로고 — 핀 로고가 통통 튀고 그 아래 그림자가 함께 움직입니다.
// 화면 전체가 준비되는 동안(page), 목록·카드 안에서 내용을 기다리는 동안(inline) 모두 이 하나를 씁니다.
// 예전에는 "불러오는 중..." 글자만 있거나 회색 뼈대 화면이었습니다.
// (움직임을 줄이도록 설정한 기기에서는 튀지 않고 가만히 있습니다.)

const MARK_SRC = "/icons/logo_mark.png";

export default function LogoLoader({
  label = "불러오는 중…",
  size = 44,
  page = false,
}: {
  /** 로고 아래 글자. 빈 문자열이면 글자 없이 로고만 */
  label?: string;
  /** 로고 가로 크기(px) */
  size?: number;
  /** true면 화면 전체를 크림색으로 채우고 가운데에 둡니다(페이지가 준비되는 동안) */
  page?: boolean;
}) {
  const height = Math.round((size * 360) / 304);
  const body = (
    <div
      role="status"
      aria-live="polite"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: Math.round(size * 0.2), padding: page ? 0 : "6px 0" }}
    >
      <style>{`
        @keyframes ggk-logo-hop { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-22%); } }
        @keyframes ggk-logo-shadow { 0%, 100% { transform: scaleX(1); opacity: .22; } 45% { transform: scaleX(.6); opacity: .1; } }
        .ggk-logo-hop { animation: ggk-logo-hop 0.9s cubic-bezier(.4, 0, .4, 1) infinite; }
        .ggk-logo-shadow { animation: ggk-logo-shadow 0.9s cubic-bezier(.4, 0, .4, 1) infinite; }
        @media (prefers-reduced-motion: reduce) { .ggk-logo-hop, .ggk-logo-shadow { animation: none; } }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ggk-logo-hop" src={MARK_SRC} alt="" aria-hidden="true" width={size} height={height} style={{ display: "block", width: size, height }} />
        <div className="ggk-logo-shadow" aria-hidden="true" style={{ width: Math.round(size * 0.5), height: Math.max(3, Math.round(size * 0.09)), borderRadius: "50%", background: "#3B2A1C", marginTop: Math.round(size * 0.06) }} />
      </div>
      {label ? (
        <div className="ggk-body" style={{ fontSize: page ? 14 : 12.5, fontWeight: 600, color: "#8A7A69" }}>{label}</div>
      ) : (
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>불러오는 중</span>
      )}
    </div>
  );
  if (!page) return body;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F3E8" }}>
      {body}
    </div>
  );
}
