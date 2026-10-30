// 같이가개 슈나우저 — 로고의 얼굴 구성(밝은 눈썹, 까만 눈·코, 하얀 수염)은 그대로 두고,
// 얼굴형을 실제 슈나우저처럼 그린 그림입니다(위가 납작한 네모난 머리, 턱 아래로 내려오는 수염, 반쯤 앞으로 접힌 귀).
// 털색은 회색(솔트 앤 페퍼) 슈나우저입니다.
// <PeekingDogs />를 position:relative인 카드 묶음 안에 두면, 큰 강아지·작은 강아지 두 마리가 카드 위로 내다봅니다
// (얼굴은 카드 뒤, 앞발은 카드 앞).

type Tone = { coat: string; ear: string; fold: string; inner: string; light: string; ink: string };
const GRAY: Tone = { coat: "#7E8186", ear: "#5E6166", fold: "#484B50", inner: "#D6A49C", light: "#F5F4F0", ink: "#26262A" };
const SILVER: Tone = { coat: "#9A9DA2", ear: "#74777C", fold: "#5C5F64", inner: "#DDAFA7", light: "#FAF9F6", ink: "#26262A" };

const VB = { x: 36, y: 0, w: 168, h: 240 };
// 얼굴 그림에서 카드 끝에 맞출 높이(수염 윗부분까지 보이게)
const PEEK_Y = 205;

/** 슈나우저 얼굴(카드 뒤에 두면 수염 아래가 가려져 "내다보는" 모양) */
export function SchnauzerHead({ width = 64, tone = GRAY }: { width?: number; tone?: Tone }) {
  const t = tone;
  return (
    <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} width={width} height={(width * VB.h) / VB.w} aria-hidden style={{ display: "block" }}>
      {/* 귀 — 서 있는 부분 */}
      <path d="M58 66 L44 22 Q70 6 98 14 L104 44 Z" fill={t.ear} stroke={t.ear} strokeWidth="6" strokeLinejoin="round" />
      <path d="M182 66 L196 22 Q170 6 142 14 L136 44 Z" fill={t.ear} stroke={t.ear} strokeWidth="6" strokeLinejoin="round" />
      {/* 머리 — 위가 납작한 네모난 얼굴 */}
      <path d="M52 58 Q56 34 86 32 L154 32 Q184 34 188 58 L194 150 Q194 172 176 178 L64 178 Q46 172 46 150 Z" fill={t.coat} />
      {/* 귀 — 안쪽 분홍빛과 앞으로 반쯤 접혀 내려온 부분 */}
      <path d="M70 44 L92 18 L100 42 Z" fill={t.inner} />
      <path d="M170 44 L148 18 L140 42 Z" fill={t.inner} />
      <path d="M42 22 Q72 2 100 14 Q86 36 62 60 Q50 42 42 22 Z" fill={t.fold} stroke={t.fold} strokeWidth="6" strokeLinejoin="round" />
      <path d="M198 22 Q168 2 140 14 Q154 36 178 60 Q190 42 198 22 Z" fill={t.fold} stroke={t.fold} strokeWidth="6" strokeLinejoin="round" />
      <path d="M46 20 Q72 4 98 12" stroke={t.coat} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M194 20 Q168 4 142 12" stroke={t.coat} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 눈썹 — 로고와 같은 반달 모양 */}
      <path d="M62 90 Q66 72 86 74 Q102 76 114 92 Q100 96 86 96 Q70 96 62 90 Z" fill={t.light} />
      <path d="M178 90 Q174 72 154 74 Q138 76 126 92 Q140 96 154 96 Q170 96 178 90 Z" fill={t.light} />
      {/* 눈 */}
      <circle cx="94" cy="111" r="7" fill={t.ink} />
      <circle cx="146" cy="111" r="7" fill={t.ink} />
      {/* 수염 — 턱 아래로 풍성하게 내려오고 끝이 결처럼 갈라진 모양 */}
      <path d="M54 146 Q54 124 80 122 Q102 118 120 126 Q138 118 160 122 Q186 124 186 146 Q188 176 176 196 Q172 210 160 206 Q156 220 144 212 Q136 226 126 214 Q120 224 114 214 Q104 226 96 212 Q84 220 80 206 Q68 210 64 196 Q52 176 54 146 Z" fill={t.light} />
      {/* 코 */}
      <path d="M102 128 Q120 118 138 128 Q138 142 120 148 Q102 142 102 128 Z" fill={t.ink} />
    </svg>
  );
}

/** 카드 끝을 잡은 앞발(카드 앞) — 얼굴과 같은 폭 기준 */
export function SchnauzerPaws({ width = 64, tone = GRAY }: { width?: number; tone?: Tone }) {
  const paw = (x: number) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="0" width="26" height="20" rx="10" fill={tone.coat} />
      <path d="M8 4 V10 M13 3.5 V10 M18 4 V10" stroke={tone.fold} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 20" width={width} height={(width * 20) / 120} aria-hidden style={{ display: "block" }}>
      {paw(20)}{paw(74)}
    </svg>
  );
}

/** 카드 위로 내다보는 강아지 두 마리(큰 강아지 + 작은 강아지). 카드 묶음(position:relative) 안에 둡니다. */
export const PEEK_SPACE = 84; // 카드 위에 비워 둘 높이
export function PeekingDogs({ right = 32 }: { right?: number }) {
  const dogs = [
    { width: 62, tone: GRAY, right },
    { width: 44, tone: SILVER, right: right + 62 + 2 },
  ];
  return (
    <>
      {dogs.map((d, i) => {
        const h = (d.width * VB.h) / VB.w;
        return (
          <div key={`h${i}`} style={{ position: "absolute", top: -Math.round((h * PEEK_Y) / VB.h), right: d.right, zIndex: 0 }}>
            <SchnauzerHead width={d.width} tone={d.tone} />
          </div>
        );
      })}
      {dogs.map((d, i) => (
        <div key={`p${i}`} style={{ position: "absolute", top: -Math.round(d.width / 12), right: d.right, zIndex: 2, pointerEvents: "none" }}>
          <SchnauzerPaws width={d.width} tone={d.tone} />
        </div>
      ))}
    </>
  );
}
