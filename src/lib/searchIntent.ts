// src/lib/searchIntent.ts
//
// 지도 검색창에 쓴 말을 "어디에서 · 무엇을" 찾는지로 풀어 줍니다.
//
//   "우리동네 핫플"        → 내 주변에서 · HOT(요즘 많이 본) 장소
//   "우리동네 새장소"      → 내 주변에서 · NEW(새로 등록된) 장소
//   "대구 삼덕동 카페"     → 대구 삼덕동에서 · 카페
//   "성수 핫플"            → 성수(지역인지 가게 이름인지는 지도 화면이 확인)에서 · HOT 장소
//   "우리동네 스타벅스"    → 내 주변에서 · 이름에 "스타벅스"가 들어간 곳
//
// 여기서는 글자만 풀어냅니다(브라우저·서버 어디서나 쓸 수 있고 테스트하기 쉽게). 지역 이름을 실제 좌표로 바꾸거나
// 장소를 걸러 내는 일은 KakaoMap.tsx가 합니다.
//
// ⚠ 아는 낱말이 하나도 없으면(예: "스타벅스", "대구 중구") structured가 false입니다. 그때는 예전 검색 방식
// (가게 이름 → 없으면 지역 이름)을 그대로 씁니다 — 이 파일 때문에 기존 검색이 달라지지 않게 하기 위함입니다.

export type SearchBadge = "hot" | "new";
export type SearchZone = "indoor" | "outdoor";

export type SearchIntent = {
  /** 아는 낱말(우리동네·핫플·카페 등)이 하나라도 있었는지. false면 예전 검색 방식 그대로 */
  structured: boolean;
  /** "우리동네", "내 주변", "근처"처럼 내 위치를 가리키는 말이 있었는지 */
  nearMe: boolean;
  badge: SearchBadge | null;
  /** 찾는 종류(화면에 보여 줄 이름). 없으면 null */
  categoryLabel: string | null;
  /** 그 종류에 해당하는 데이터의 category 값들 */
  categories: string[];
  /** 공원을 찾는지(공원은 장소와 따로 관리되는 데이터라 구분합니다) */
  parks: boolean;
  zone: SearchZone | null;
  largeDog: boolean;
  /** 아는 낱말을 빼고 남은 말 — 지역 이름이거나 가게 이름입니다(예: "대구 삼덕동", "스타벅스") */
  rest: string;
  /** rest가 "삼덕동", "대구", "수성구"처럼 지역 이름으로 보이는지(끝 글자·시도 이름 기준) */
  restLooksRegion: boolean;
};

/** 시·도 이름(짧은 표기) */
export const SIDO = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

// ── 낱말 사전 ──
// 띄어 쓴 낱말 하나가 아래 말과 "똑같을 때" 그 뜻으로 봅니다. 붙여 쓴 말("우리동네핫플", "대구카페")은 아래
// splitCompound가 앞뒤로 잘라서 다시 봅니다. 한 글자짜리("핫", "새")는 다른 말의 일부일 수 있어(핫도그, 새우)
// 따로 띄어 썼을 때만 인정합니다.
const NEAR_ME = ["우리동네", "동네", "내주변", "주변", "근처", "내근처", "이근처", "여기", "가까운", "내위치", "현위치", "집근처", "집앞"];
const HOT = ["핫플", "핫플레이스", "핫한", "핫한곳", "핫", "hot", "인기", "인기있는", "인기장소", "요즘뜨는", "뜨는", "많이찾는", "인기많은"];
const NEW = ["새장소", "새로운", "새로생긴", "신규", "신상", "new", "뉴", "최근등록", "새", "새가게", "새로운곳", "신규장소"];
const INDOOR = ["실내", "실내가능", "실내동반"];
const OUTDOOR = ["야외", "실외", "테라스", "야외가능", "마당"];
const LARGE_DOG = ["대형견", "대형견가능", "큰개", "큰강아지"];
/** 뜻이 없어 버리는 말 */
const FILLER = ["추천", "장소", "가게", "곳", "어디", "찾아줘", "알려줘", "보여줘", "있는", "가능한", "가능", "반려동물", "반려견", "애견", "강아지", "고양이", "동반", "펫", "갈만한", "가볼만한", "갈곳", "좋은", "의", "에", "에서", "근방"];

type CategoryRule = { label: string; words: string[]; categories: string[]; parks?: boolean };
const CATEGORY_RULES: CategoryRule[] = [
  { label: "카페", words: ["카페", "커피", "커피숍", "디저트", "베이커리", "빵집"], categories: ["카페", "휴게음식점", "제과점영업"] },
  { label: "식당", words: ["식당", "음식점", "맛집", "밥집", "레스토랑", "술집", "고깃집"], categories: ["일반음식점", "음식점", "식당"] },
  { label: "동물병원", words: ["동물병원", "병원", "수의사"], categories: ["동물병원"] },
  { label: "동물약국", words: ["동물약국", "약국"], categories: ["동물약국"] },
  { label: "미용", words: ["미용", "미용실", "애견미용", "그루밍", "펫미용"], categories: ["미용"] },
  { label: "용품점", words: ["용품", "용품점", "펫샵", "사료", "간식", "반려동물용품"], categories: ["반려동물용품"] },
  { label: "쇼핑", words: ["쇼핑", "마트", "매장", "쇼핑몰", "백화점"], categories: ["쇼핑"] },
  { label: "숙소", words: ["숙소", "숙박", "펜션", "호텔", "리조트"], categories: ["숙박", "펜션"] },
  { label: "위탁·돌봄", words: ["위탁", "유치원", "호텔링", "돌봄", "애견호텔", "애견유치원"], categories: ["위탁관리"] },
  { label: "여행지", words: ["여행", "여행지", "관광", "관광지", "놀거리", "레포츠", "나들이"], categories: ["여행지", "관광지", "레포츠"] },
  { label: "문화시설", words: ["박물관", "미술관", "전시", "문화시설", "문화"], categories: ["박물관", "미술관", "문화시설"] },
  { label: "공원", words: ["공원", "산책", "산책로", "산책길"], categories: [], parks: true },
];

type Meaning =
  | { kind: "near" } | { kind: "hot" } | { kind: "new" } | { kind: "indoor" } | { kind: "outdoor" }
  | { kind: "largeDog" } | { kind: "filler" } | { kind: "category"; rule: CategoryRule };

const DICTIONARY = new Map<string, Meaning>();
const add = (words: string[], meaning: Meaning) => { for (const w of words) DICTIONARY.set(w, meaning); };
add(FILLER, { kind: "filler" });
add(NEAR_ME, { kind: "near" });
add(HOT, { kind: "hot" });
add(NEW, { kind: "new" });
add(INDOOR, { kind: "indoor" });
add(OUTDOOR, { kind: "outdoor" });
add(LARGE_DOG, { kind: "largeDog" });
for (const rule of CATEGORY_RULES) add(rule.words, { kind: "category", rule });

/** 붙여 쓴 말을 자를 때 쓸 낱말(2글자 이상만 — 한 글자는 다른 말의 일부일 가능성이 큽니다). 긴 말부터 맞춰 봅니다. */
const COMPOUND_WORDS = [...DICTIONARY.keys()].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
/** "내 주변", "우리 동네"처럼 띄어 써도 한 낱말로 봐야 하는 말 */
const JOIN_PAIRS: [string, string][] = [["우리", "동네"], ["내", "주변"], ["내", "근처"], ["이", "근처"], ["내", "위치"], ["집", "근처"], ["집", "앞"], ["새", "장소"], ["새", "가게"], ["요즘", "뜨는"], ["새로", "생긴"], ["많이", "찾는"], ["최근", "등록"], ["핫", "플"]];

/**
 * 붙여 쓴 낱말 하나를 앞·뒤에서 아는 말로 잘라 냅니다.
 * 예: "우리동네핫플" → ["우리동네", "핫플"], "대구카페" → ["대구", "카페"], "삼덕동핫플" → ["삼덕동", "핫플"]
 * 아는 말이 하나도 안 붙어 있으면 그대로 돌려줍니다("스타벅스" → ["스타벅스"]).
 */
function splitCompound(token: string): string[] {
  if (DICTIONARY.has(token)) return [token];
  const head: string[] = [], tail: string[] = [];
  let rest = token;
  let changed = true;
  while (changed && rest.length > 0) {
    changed = false;
    if (DICTIONARY.has(rest)) { head.push(rest); rest = ""; break; }
    for (const word of COMPOUND_WORDS) {
      if (rest.length > word.length && rest.startsWith(word)) { head.push(word); rest = rest.slice(word.length); changed = true; break; }
      if (rest.length > word.length && rest.endsWith(word)) { tail.unshift(word); rest = rest.slice(0, -word.length); changed = true; break; }
    }
  }
  // 남은 가운데 토막이 한 글자뿐이면(예: "핫도그"에서 "도그"를 뗀 게 아니라 엉뚱하게 잘린 경우) 자르지 않은 것으로 봅니다.
  if (rest.length === 1 && !SIDO.includes(rest)) return [token];
  return [...head, ...(rest ? [rest] : []), ...tail];
}

/** 지역 이름처럼 보이는지 — 시·도 이름이거나, 행정구역 글자(시·도·군·구·읍·면·동·리·가·로·길)로 끝나는 2글자 이상 */
export function looksLikeRegion(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) => SIDO.includes(t) || (t.length >= 2 && /(특별시|광역시|시|도|군|구|읍|면|동|리|가|로|길)$/.test(t)));
}

export function parseSearchIntent(query: string): SearchIntent {
  const intent: SearchIntent = { structured: false, nearMe: false, badge: null, categoryLabel: null, categories: [], parks: false, zone: null, largeDog: false, rest: "", restLooksRegion: false };
  const raw = query.trim().toLowerCase().replace(/[,.!?~·]+/g, " ").split(/\s+/).filter(Boolean);
  if (raw.length === 0) return intent;

  // 띄어 쓴 두 낱말("내 주변")을 하나로 합칩니다.
  const joined: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const pair = JOIN_PAIRS.find(([a, b]) => raw[i] === a && raw[i + 1] === b);
    if (pair) { joined.push(pair[0] + pair[1]); i++; } else joined.push(raw[i]);
  }

  const rest: string[] = [];
  for (const token of joined.flatMap(splitCompound)) {
    const meaning = DICTIONARY.get(token);
    if (!meaning) { rest.push(token); continue; }
    switch (meaning.kind) {
      case "filler": break;
      case "near": intent.nearMe = true; intent.structured = true; break;
      case "hot": intent.badge = "hot"; intent.structured = true; break;
      case "new": intent.badge = "new"; intent.structured = true; break;
      case "indoor": intent.zone = "indoor"; intent.structured = true; break;
      case "outdoor": intent.zone = "outdoor"; intent.structured = true; break;
      case "largeDog": intent.largeDog = true; intent.structured = true; break;
      case "category":
        intent.structured = true;
        intent.categoryLabel = intent.categoryLabel ? `${intent.categoryLabel}·${meaning.rule.label}` : meaning.rule.label;
        intent.categories.push(...meaning.rule.categories);
        if (meaning.rule.parks) intent.parks = true;
        break;
    }
  }
  intent.rest = rest.join(" ");
  intent.restLooksRegion = looksLikeRegion(intent.rest);
  // "대구 올리브영", "수성구 스타벅스"처럼 아는 낱말은 없지만 "지역 이름 + 다른 말"인 경우도 풀이합니다
  // (지역으로 가서 그 이름을 찾음). "대구 중구"처럼 전부 지역 이름이면 예전 방식(지역 검색) 그대로 둡니다.
  if (!intent.structured && rest.length >= 2 && looksLikeRegion(rest[0]) && !intent.restLooksRegion) intent.structured = true;
  return intent;
}

/** 화면에 보여 줄 한 줄 설명. 예: "우리동네 · HOT", "대구 삼덕동 · 카페" */
export function describeIntent(intent: SearchIntent, where: string | null, keyword: string | null): string {
  const parts: string[] = [];
  if (where) parts.push(where);
  else if (intent.nearMe) parts.push("우리동네");
  if (intent.badge === "hot") parts.push("HOT");
  if (intent.badge === "new") parts.push("NEW");
  if (intent.categoryLabel) parts.push(intent.categoryLabel);
  if (intent.zone === "indoor") parts.push("실내");
  if (intent.zone === "outdoor") parts.push("야외");
  if (intent.largeDog) parts.push("대형견");
  if (keyword) parts.push(`"${keyword}"`);
  return parts.join(" · ");
}
