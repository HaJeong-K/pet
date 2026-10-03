// src/lib/server/ogCard.tsx
//
// 공유 미리보기 카드(1200×630) 그리기 — 카카오톡·메신저에 링크를 붙였을 때 보이는 이미지입니다.
// 사진이 없는 장소도 이름·주소·분류가 담긴 카드로 보기 좋게 나오게 합니다(예전엔 가로 141px짜리
// 작은 로고가 그대로 쓰여 카드가 빈약했습니다).
//
// 한글 글꼴: 이미지 생성기(next/og)는 한글 글꼴이 내장돼 있지 않아, 카드에 들어갈 글자만 담은
// Noto Sans KR 조각을 구글 폰트에서 받아 씁니다(글자 수만큼만 받아서 가볍습니다).

import { ImageResponse } from "next/og";

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "같이가개";
const TAGLINE = "반려동물과 함께 갈 수 있는 곳";

async function loadKoreanFont(text: string, weight: 400 | 800): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(4000) })).text();
    const fontUrl = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!fontUrl) return null;
    const res = await fetch(fontUrl, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export async function renderShareCard(opts: { title: string; subtitle?: string; tags?: string[] }): Promise<ImageResponse> {
  const title = clip(opts.title.trim() || BRAND, 34);
  const subtitle = clip((opts.subtitle || "").trim(), 60);
  const tags = (opts.tags || []).filter(Boolean).slice(0, 3).map((t) => clip(t, 14));

  const allText = [BRAND, TAGLINE, title, subtitle, ...tags, "…"].join("");
  const [bold, regular] = await Promise.all([loadKoreanFont(allText, 800), loadKoreanFont(allText, 400)]);
  const fonts = [
    bold && { name: "Noto Sans KR", data: bold, weight: 800 as const, style: "normal" as const },
    regular && { name: "Noto Sans KR", data: regular, weight: 400 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "#F7F3E8", padding: "64px 72px", fontFamily: "Noto Sans KR",
          borderLeft: "24px solid #5C7A4A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: "#5C7A4A" }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#48603A" }}>{BRAND}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: title.length > 18 ? 64 : 80, fontWeight: 800, color: "#1f2937", lineHeight: 1.2 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 34, fontWeight: 400, color: "#6b7280" }}>{subtitle}</div>
          ) : null}
          {tags.length > 0 ? (
            <div style={{ display: "flex", gap: 14 }}>
              {tags.map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex", fontSize: 28, fontWeight: 800, color: "#48603A",
                    background: "#E4EBDC", borderRadius: 999, padding: "10px 26px",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: 28, fontWeight: 400, color: "#8b9484" }}>{TAGLINE}</div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fonts.length > 0 ? fonts : undefined,
      // 같은 카드를 매번 다시 그리지 않도록 하루 동안 캐시합니다(브라우저·CDN).
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" },
    }
  );
}
