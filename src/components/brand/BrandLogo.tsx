// 펫츠로드 로고 — 모든 화면이 이 부품 하나로 로고를 그립니다(핀 그림 + 구기 글꼴 글자를 한 장으로 합친 그림).
// 2026-11-09: 그림 파일(PNG)을 벡터(SVG)로 다시 그려 확대해도 깨지지 않습니다. 핀 그림만 쓰는 곳은 /icons/logo_mark.svg.
// ⚠ 로고를 바꿀 때는 그림 파일만 새 이름(…_v4.svg 등)으로 올리고 아래 LOGO_SRC만 고치세요.
//    같은 이름으로 덮어쓰면 브라우저·이미지 서버(CDN)가 예전 그림을 계속 보여 줍니다(2026-11-06 실제로 예전 글꼴이 보였음).
//    화면 코드에서 그림 주소를 직접 쓰지 않도록 src/lib/brandLogo.test.ts가 검사합니다.

/* eslint-disable @next/next/no-img-element */
export const LOGO_SRC = "/icons/petsroad_logo_v3.svg";
/** 그림 원본 크기(가로·세로 비율 계산용) */
export const LOGO_W = 558, LOGO_H = 168;

export default function BrandLogo({ height = 28, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={LOGO_SRC}
      alt="펫츠로드"
      width={Math.round((LOGO_W / LOGO_H) * height)}
      height={height}
      decoding="async"
      style={{ display: "block", height, width: "auto", objectFit: "contain", flexShrink: 0, ...style }}
    />
  );
}
