// src/lib/talkSearch.ts
//
// 쇼핑·숙소 탭의 "말하듯이 검색" — "대구 수제간식", "대구에 있는 한옥"처럼 적어도 찾습니다.
// 낱말마다 가게 이름·주소·분류·해시태그·메뉴 이름 가운데 어딘가에 있으면 찾은 것으로 봅니다. 띄어쓰기는 따지지 않습니다.
// 해시태그는 사장님이 직접 정합니다(한 곳당 5개까지).

export const SEARCH_TAGS_MAX = 5;
export const SEARCH_TAG_LENGTH_MAX = 12;

const compact = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// 뜻 없이 붙는 말은 검색어에서 뺍니다
const STOP_WORDS = new Set(["근처", "주변", "추천", "파는", "있는", "좋은", "곳", "집", "가게", "좀", "찾아줘", "알려줘"]);
const PARTICLE = /(에있는|에서|으로|에|의|을|를|은|는|이|가|로)$/;

export function talkTokens(query: string): string[] {
  return query.trim().split(/\s+/).map((w) => w.toLowerCase()).filter((w) => w && !STOP_WORDS.has(w));
}

export function matchesTalk(query: string, parts: (string | null | undefined)[]): boolean {
  const tokens = talkTokens(query);
  if (tokens.length === 0) return true;
  const text = compact(parts.filter(Boolean).join(" "));
  if (text.includes(compact(query))) return true;
  return tokens.every((t) => {
    if (text.includes(t)) return true;
    const stem = t.replace(PARTICLE, "");
    return stem.length >= 2 && text.includes(stem);
  });
}

/** 사장님이 적은 해시태그 다듬기 — # 과 띄어쓰기를 빼고, 같은 말은 하나로, 5개까지 */
export function cleanSearchTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const tag = item.replace(/[#\s]/g, "").slice(0, SEARCH_TAG_LENGTH_MAX);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === SEARCH_TAGS_MAX) break;
  }
  return out;
}
