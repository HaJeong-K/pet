// src/lib/server/ogCard.tsx
//
// 장소 공유 카드(1200×630) 그리기 — 카카오톡·메신저에 장소 링크를 붙였을 때 보이는 이미지입니다.
// 사진이 없는 장소도 이름·주소·분류가 담긴 카드로 보기 좋게 나오게 합니다.
//
// 디자인은 사이트 기본 공유 그림(public/og-default.png)과 같은 틀입니다:
//   왼쪽 위 로고(핀 + "같이가개") · 왼쪽에 큰 제목과 한 줄 설명 · 오른쪽에 지도 한 조각과 핀.
// 기본 그림은 미리 만들어 둔 파일이고, 이 카드는 장소마다 이름이 달라 요청 때 그립니다.
//
// 한글 글꼴: 이미지 생성기(next/og)는 한글 글꼴이 내장돼 있지 않아, 카드에 들어갈 글자만 담은
// 글꼴 조각을 구글 폰트에서 받아 씁니다(글자 수만큼만 받아서 가볍습니다).

import { ImageResponse } from "next/og";

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "같이가개";

const INK = "#3B2A1C";
const BROWN = "#8B5E3C";
const GREEN = "#5C7A4A";
const CREAM = "#F7F3E8";

async function loadFont(family: string, text: string, weight?: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}${weight ? `:wght@${weight}` : ""}&text=${encodeURIComponent(text)}`;
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
/** 괄호와 그 안의 내용을 뺍니다. 빼고 나서 남는 것이 거의 없으면(이름 전체가 괄호인 경우 등) 원래 글자를 그대로 씁니다. */
function withoutParens(text: string): string {
  const original = text.trim();
  const stripped = original.replace(/\s*[(（][^)）]*[)）]?/g, "").replace(/\s+/g, " ").trim();
  return stripped.length >= 2 ? stripped : original;
}

/** 핀 속 슈나우저(로고 그림) — 앱 아이콘·헤더 로고와 같은 도형 */
function Pin({ size }: { size: number }) {
  return (
    <svg width={Math.round((size * 152) / 180)} height={size} viewBox="24 12 152 180">
      <path d="M100 18 C60 18 30 48 30 86 C30 128 74 156 100 186 C126 156 170 128 170 86 C170 48 140 18 100 18Z" fill={BROWN} />
      <g transform="translate(18 4) scale(.82)">
        <path d="M52 72 C56 56 78 54 94 66 C88 71 80 73 74 77 C68 82 54 82 52 72Z" fill="#FBFAF6" />
        <path d="M148 72 C144 56 122 54 106 66 C112 71 120 73 126 77 C132 82 146 82 148 72Z" fill="#FBFAF6" />
        <path d="M54 106 C52 90 80 88 100 97 C120 88 148 90 146 106 C152 126 140 146 100 148 C60 146 48 126 54 106Z" fill="#FBFAF6" />
        <circle cx="80" cy="88" r="5.5" fill="#2a2620" />
        <circle cx="120" cy="88" r="5.5" fill="#2a2620" />
        <path d="M87 104 C87 98 113 98 113 104 C113 111 106 115 100 115 C94 115 87 111 87 104Z" fill="#2a2620" />
      </g>
    </svg>
  );
}

/** 오른쪽의 지도 한 조각(길·공원) */
function MapTile() {
  return (
    <svg width="400" height="490" viewBox="0 0 400 490">
      {/* 둥근 모서리는 그림 안에서 잘라 냅니다(바깥 상자의 둥근 모서리로는 그림이 잘리지 않아서). */}
      <defs>
        <clipPath id="tile"><rect width="400" height="490" rx="48" /></clipPath>
      </defs>
      <g clipPath="url(#tile)">
      <rect width="400" height="490" fill="#EDF1E5" />
      <path d="M220 24 q200 49 200 206 v-245 z" fill="#C9D6B7" />
      <ellipse cx="88" cy="392" rx="104" ry="78" fill="#C9D6B7" />
      <path d="M-20 176 L420 245" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" fill="none" />
      <path d="M144 -20 L184 510" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" fill="none" />
      <path d="M288 225 L320 510" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M-20 333 L168 304" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

export async function renderShareCard(opts: { title: string; subtitle?: string; tags?: string[] }): Promise<ImageResponse> {
  // 괄호 안 덧붙임(영문 표기 "(HOI POLLOI …)", 주소의 "(1층 응암동)" 등)은 카드에서 뺍니다 — 줄이 어색하게 넘어가고 핵심이 아니라서.
  const title = clip(withoutParens(opts.title) || BRAND, 26);
  const subtitle = clip(withoutParens(opts.subtitle || ""), 26);
  const tags = (opts.tags || []).filter(Boolean).slice(0, 2).map((t) => clip(t, 10));

  const bodyText = [title, subtitle, ...tags, "…"].join("");
  const [bold, medium, brand] = await Promise.all([
    loadFont("Noto+Sans+KR", bodyText, 800),
    loadFont("Noto+Sans+KR", bodyText, 500),
    loadFont("Single+Day", BRAND),
  ]);
  const fonts = [
    bold && { name: "Noto Sans KR", data: bold, weight: 800 as const, style: "normal" as const },
    medium && { name: "Noto Sans KR", data: medium, weight: 500 as const, style: "normal" as const },
    brand && { name: "Single Day", data: brand, weight: 400 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 500 | 800; style: "normal" }[];

  // 글자 칸은 약 620px — 이름 길이에 따라 크기를 줄여 두세 줄 안에 들어가게 합니다.
  const titleSize = title.length <= 8 ? 88 : title.length <= 14 ? 72 : title.length <= 22 ? 58 : 50;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: CREAM, fontFamily: "Noto Sans KR" }}>
        {/* 왼쪽: 로고 · 제목 · 설명 */}
        <div style={{ display: "flex", flexDirection: "column", width: 730, height: "100%", padding: "72px 30px 70px 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Pin size={78} />
            <div style={{ display: "flex", fontFamily: brand ? "Single Day" : "Noto Sans KR", fontSize: 68, color: "#6B4526", lineHeight: 1 }}>
              <span>같</span><span style={{ color: "#8FA876" }}>이</span><span>가개</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 20 }}>
            <div style={{ display: "flex", fontSize: titleSize, fontWeight: 800, color: INK, lineHeight: 1.18, letterSpacing: -2, wordBreak: "keep-all" }}>
              {title}
            </div>
            {subtitle ? (
              <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "#75675A", lineHeight: 1.35 }}>{subtitle}</div>
            ) : null}
            {tags.length > 0 ? (
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                {tags.map((t, i) => (
                  <div
                    key={t}
                    style={{
                      display: "flex", fontSize: 28, fontWeight: 800, borderRadius: 999, padding: "9px 26px",
                      color: i === 0 ? "#FFFFFF" : GREEN, background: i === 0 ? GREEN : "#E4EBDC",
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* 오른쪽: 지도 한 조각과 핀 */}
        <div style={{ display: "flex", width: 470, height: "100%", alignItems: "center" }}>
          <div style={{ display: "flex", position: "relative", width: 400, height: 490 }}>
            <MapTile />
            <div style={{ display: "flex", position: "absolute", left: 109, top: 142 }}>
              <Pin size={216} />
            </div>
          </div>
        </div>
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
