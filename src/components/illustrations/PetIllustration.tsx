"use client";

// 같이가개 로고 그림(핀 속 슈나우저) — 빈 화면("아직 찜한 장소가 없어요" 등)에 쓰는 작은 그림입니다.
// 앱 아이콘·헤더 로고·공유 그림과 같은 핀 로고 하나로 통일했습니다(public/icons/logo_mark.png).
// 예전의 손그림 슈나우저 두 마리 그림은 더 이상 쓰지 않습니다.

type Variant = "empty" | "hero" | "success" | "search" | "header";

const MARK_SRC = "/icons/logo_mark.png";
/** 그림의 가로:세로 비율(304×360) */
const MARK_RATIO = 360 / 304;

export default function PetIllustration({
  variant = "empty",
  width = 160,
  className,
}: {
  variant?: Variant;
  width?: number;
  className?: string;
}) {
  void variant;
  return (
    // 꾸밈용 그림이라 대체 글자를 비워 둡니다 — 이미지를 못 받았을 때(통신이 잠깐 끊긴 경우 등)
    // 설명 글자가 좁은 칸에 세로로 깨져 보이던 문제가 있었습니다. 실패하면 한 번 다시 받고, 그래도 안 되면 숨깁니다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MARK_SRC}
      alt=""
      aria-hidden="true"
      className={className}
      width={width}
      height={Math.round(width * MARK_RATIO)}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.retried) { img.dataset.retried = "1"; img.src = `${MARK_SRC}?r=1`; }
        else img.style.visibility = "hidden";
      }}
      style={{ display: "block", width, height: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
