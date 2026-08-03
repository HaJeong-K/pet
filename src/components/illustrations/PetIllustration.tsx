"use client";

// 같이가개 마스코트 — 사용자가 직접 지정한 실제 로고 이미지(같이가개 헤더에 쓰이는
// 슈나우저 두 마리 일러스트, public/icons/header_logo_final.png)를 그대로 사용합니다.
// 이전엔 이 이미지의 "분위기"를 참고해서 SVG로 새로 그렸지만, 그 결과물이 실제
// 이미지의 따뜻하고 귀여운 느낌을 살리지 못한다는 피드백을 받아 재작업 대신
// 원본 이미지 파일을 직접 재사용하는 방식으로 변경했습니다 — 어디에 써도 항상
// 같은 실제 이미지라 브랜드 톤이 완벽히 통일됩니다.

type Variant = "empty" | "hero" | "success" | "search" | "header";

const MASCOT_SRC = "/icons/header_logo_final.png";

export default function PetIllustration({
  variant = "empty",
  width = 160,
  className,
}: {
  variant?: Variant;
  width?: number;
  className?: string;
}) {
  return (
    <img
      src={MASCOT_SRC}
      alt="같이가개 — 반갑게 웃고 있는 슈나우저 두 마리"
      className={className}
      width={width}
      style={{ display: "block", width, height: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}

// ── 텍스트("같이가개") 없이 슈나우저 두 마리만 — 커뮤니티/관리자 페이지 전용.
// 같은 원본 이미지를 잘라 쓰는 방식(배경 이미지를 컨테이너 높이에 맞춰 확대한 뒤
// 왼쪽 끝/오른쪽 끝만 노출)이라 새로 그리지 않고 실제 이미지 그대로 사용합니다.
export function SchnauzerDuo({
  size = 40,
  gap = 10,
  className,
}: {
  size?: number;
  gap?: number;
  className?: string;
}) {
  const cropStyle = (side: "left" | "right"): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    backgroundImage: `url(${MASCOT_SRC})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "auto 220%",
    backgroundPosition: side === "left" ? "0% 55%" : "100% 55%",
    flexShrink: 0,
  });
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap }}>
      <div style={cropStyle("left")} aria-hidden="true" />
      <div style={cropStyle("right")} aria-hidden="true" />
    </div>
  );
}
