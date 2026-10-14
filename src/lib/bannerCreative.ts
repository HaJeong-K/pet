// src/lib/bannerCreative.ts
//
// 사장님이 직접 만드는 배너 광고의 규칙 — 고를 수 있는 글꼴, 글자 수, "2주에 한 번" 변경 한도.
// 화면(미리보기)과 서버(저장)가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다.

export const BANNER_HEADLINE_MAX = 22;
export const BANNER_BODY_MAX = 44;
/** 배너 내용을 바꿀 수 있는 주기(일) */
export const BANNER_CHANGE_DAYS = 14;
/** 배너 사진 파일 크기 한도 */
export const BANNER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BANNER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type BannerFontId = "logo" | "gothic" | "gothic-soft" | "gothic-bold" | "gothic-square" | "serious" | "pen" | "cute" | "round";

/**
 * 고를 수 있는 글꼴. 모두 구글 글꼴(Open Font License)이라 상업적으로 써도 됩니다.
 *   family : 화면에 적용하는 글꼴 이름(앞에서부터 있는 것을 씀)
 *   google : 구글 글꼴에서 받아 올 이름(없으면 이미 사이트가 받아 둔 글꼴)
 * "진지한 궁서체"는 기기에 궁서체가 있으면(윈도우·맥) 궁서체로, 없으면(대부분의 휴대폰) 같은 느낌의 명조체로 보입니다.
 */
export const BANNER_FONTS: { id: BannerFontId; label: string; family: string; google?: string; weight: number }[] = [
  { id: "logo", label: "같이가개 로고체", family: "'Noto Sans KR', sans-serif", weight: 800 },
  { id: "gothic", label: "깔끔한 고딕", family: "'Noto Sans KR', sans-serif", weight: 600 },
  { id: "gothic-soft", label: "부드러운 고딕", family: "'Gowun Dodum', 'Noto Sans KR', sans-serif", google: "Gowun+Dodum", weight: 400 },
  { id: "gothic-bold", label: "굵은 제목 고딕", family: "'Black Han Sans', 'Noto Sans KR', sans-serif", google: "Black+Han+Sans", weight: 400 },
  { id: "gothic-square", label: "각진 고딕", family: "'Do Hyeon', 'Noto Sans KR', sans-serif", google: "Do+Hyeon", weight: 400 },
  { id: "serious", label: "진지한 궁서체", family: "'Gungsuh', '궁서', 'GungSeo', 'Nanum Myeongjo', serif", google: "Nanum+Myeongjo:wght@700;800", weight: 800 },
  { id: "pen", label: "손글씨", family: "'Nanum Pen Script', 'Gaegu', cursive", google: "Nanum+Pen+Script", weight: 400 },
  { id: "cute", label: "귀여운 손글씨", family: "'Gaegu', 'Noto Sans KR', cursive", weight: 700 },
  { id: "round", label: "둥근 글씨", family: "'Jua', 'Noto Sans KR', sans-serif", google: "Jua", weight: 400 },
];
export const bannerFont = (id: string | null | undefined) => BANNER_FONTS.find((f) => f.id === id) ?? BANNER_FONTS[1];
/** 손글씨처럼 같은 크기에서 작아 보이는 글꼴은 조금 키워서 보여 줍니다 */
export const bannerFontScale = (id: string | null | undefined) => (bannerFont(id).id === "pen" ? 1.3 : bannerFont(id).id === "cute" ? 1.12 : 1);
/** 그 글꼴들을 받아 오는 주소(이미 받아 둔 글꼴만이면 null) */
export function bannerFontsUrl(ids: (string | null | undefined)[]): string | null {
  const families = [...new Set(ids.map((id) => bannerFont(id).google).filter(Boolean))];
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}

/**
 * 배너에 가게 이름 옆에 적는 짧은 주소 — 맨 앞의 시·도는 빼고(같은 동네 사람에게 주로 보이므로) 나머지를 씁니다.
 * 예: "대구광역시 달서구 공원순환로 36" → "달서구 공원순환로 36". 한 단어뿐이면 그대로.
 */
export function bannerAddress(address: string | null | undefined): string | null {
  const parts = (address ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return (parts.length > 2 ? parts.slice(1) : parts).join(" ");
}

export type BannerCreative = { headline: string; body: string | null; imageUrl: string | null; font: BannerFontId };

/** 입력값을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanBannerCreative(raw: unknown): { creative: BannerCreative } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const headline = typeof r.headline === "string" ? r.headline.trim().replace(/\s+/g, " ") : "";
  if (!headline) return { error: "큰 문구를 적어 주세요." };
  if (headline.length > BANNER_HEADLINE_MAX) return { error: `큰 문구는 ${BANNER_HEADLINE_MAX}자까지예요.` };
  const body = typeof r.body === "string" && r.body.trim() ? r.body.trim().replace(/\s+/g, " ") : null;
  if (body && body.length > BANNER_BODY_MAX) return { error: `작은 문구는 ${BANNER_BODY_MAX}자까지예요.` };
  const imageUrl = typeof r.imageUrl === "string" && r.imageUrl.trim() ? r.imageUrl.trim() : null;
  if (imageUrl && !/^https:\/\/[^\s"'<>]+$/.test(imageUrl)) return { error: "사진 주소가 올바르지 않아요. 사진을 다시 올려 주세요." };
  if (!BANNER_FONTS.some((f) => f.id === r.font)) return { error: "글꼴을 골라 주세요." };
  return { creative: { headline, body, imageUrl, font: r.font as BannerFontId } };
}

export type ChangeAllowance = {
  /** 지금 바꿀 수 있는지 */
  allowed: boolean;
  /** 관리자가 풀어 준 추가 변경을 쓰게 되는지(쓰면 하나 줄어듦) */
  usesExtra: boolean;
  /** 한도가 풀리는 때(이미 풀렸거나 처음이면 null) */
  nextChangeAt: string | null;
  daysLeft: number;
};

/**
 * 배너를 지금 바꿀 수 있는지.
 *   · 아직 만든 적이 없으면 언제든
 *   · 마지막으로 바꾼 지 14일이 지났으면 가능
 *   · 아직 안 지났어도 관리자가 풀어 준 추가 변경이 남아 있으면 가능(하나 씀)
 */
export function changeAllowance(lastChangedAt: string | null | undefined, extraChanges: number, now = Date.now()): ChangeAllowance {
  if (!lastChangedAt) return { allowed: true, usesExtra: false, nextChangeAt: null, daysLeft: 0 };
  const next = new Date(lastChangedAt).getTime() + BANNER_CHANGE_DAYS * 86_400_000;
  if (next <= now) return { allowed: true, usesExtra: false, nextChangeAt: null, daysLeft: 0 };
  const daysLeft = Math.ceil((next - now) / 86_400_000);
  if (extraChanges > 0) return { allowed: true, usesExtra: true, nextChangeAt: new Date(next).toISOString(), daysLeft };
  return { allowed: false, usesExtra: false, nextChangeAt: new Date(next).toISOString(), daysLeft };
}
