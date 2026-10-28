// src/lib/bizTypeCheck.ts
//
// 사장님 자동 인증의 "업종·상호" 확인 규칙(글자만 다루는 함수 — bizTypeCheck.test.ts).
//
// 국세청 진위확인 API는 사업자번호·개업일자·대표자명 외에 상호(b_nm)·주종목(b_type)도 받아서,
// 국세청에 등록된 글자와 "정확히" 같을 때만 일치로 답합니다. 그런데 사장님이 입력하거나 OCR이 읽은 값에는
// 띄어쓰기 차이나 한두 글자 오타가 흔해서, 서버가 아래 후보를 몇 개 만들어 차례로 물어봅니다.
//   · 입력 그대로 / 띄어쓰기를 뺀 것
//   · 표준 종목명 가운데 입력과 한두 글자만 다른 것(오타 바로잡기)
// 국세청이 "일치"라고 답한 값만 인정하므로, 후보를 너그럽게 만들어도 건설업이 숙박업으로 바뀌어 통과할 수는 없습니다.
// 확인된 종목이 신청한 사장님 유형(가게 / 숙소)에 맞을 때만 자동 승인하고, 아니면 관리자 검토로 넘깁니다.

import type { OwnerKind } from "@/lib/ownerKind";

/** 비교용: 띄어쓰기·문장부호를 빼고 소문자로 */
export const compactText = (s: string) => (s || "").replace(/[\s·,.()（）\-_/]/g, "").toLowerCase();

/** 두 글자열의 편집 거리(몇 글자를 바꾸거나 넣거나 빼면 같아지는지) */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 오타로 봐줄 글자 수 — 짧은 말은 1글자, 다섯 글자 이상은 2글자까지 */
export const typoAllowance = (len: number) => (len >= 5 ? 2 : len >= 3 ? 1 : 0);

/**
 * 오타 바로잡기에 쓰는 표준 종목명(국세청 업종 분류에서 자주 쓰는 이름 + 사업자등록증에 흔히 적히는 이름).
 * 반려동물 동반 장소와 관계있는 업종 위주입니다. 여기 없는 종목도 입력한 그대로·띄어쓰기를 뺀 형태로는 확인합니다.
 */
export const STANDARD_TYPES = [
  // 숙박
  "숙박업", "일반 및 생활 숙박시설 운영업", "호텔업", "여관업", "모텔업", "민박업", "농어촌민박업", "펜션", "펜션업",
  "휴양콘도 운영업", "게스트하우스", "야영장 운영업", "야영장업", "캠핑장", "글램핑", "기타 숙박업", "한옥체험업",
  // 음식·카페
  "일반음식점", "휴게음식점", "한식 일반 음식점업", "한식", "양식", "일식", "중식", "분식", "커피전문점", "커피 전문점",
  "비알코올 음료점업", "카페", "제과점업", "제과점", "베이커리", "피자, 햄버거, 샌드위치 및 유사 음식점업",
  "기타 주점업", "생맥주 전문점", "치킨 전문점", "애견카페",
  // 반려동물·소매·서비스
  "애완동물 및 관련용품 소매업", "애완용품", "반려동물용품", "애완동물 장묘 및 보호 서비스업", "애견미용", "애완동물 미용업",
  "동물병원", "수의업", "기타 소매업", "전자상거래 소매업", "식료품 소매업", "애견훈련", "애견호텔",
];

/** 국세청에 물어볼 종목 후보(최대 4개) — 입력 그대로 → 띄어쓰기 뺀 것 → 한두 글자 다른 표준 종목명(가까운 순) */
export function typeCandidates(input: string, max = 4): string[] {
  const raw = (input || "").trim().replace(/\s+/g, " ");
  if (!raw) return [];
  const out = [raw, raw.replace(/\s/g, "")];
  const key = compactText(raw);
  const near = STANDARD_TYPES
    .map((t) => ({ t, d: editDistance(key, compactText(t)) }))
    .filter(({ t, d }) => d <= typoAllowance(Math.max(key.length, compactText(t).length)))
    .sort((a, b) => a.d - b.d);
  for (const { t } of near) out.push(t, t.replace(/\s/g, ""));
  return [...new Set(out)].slice(0, max);
}

const CORP_WORDS = /주식회사|유한회사|합자회사|합명회사|㈜|\(주\)|\(유\)/g;

/** 국세청에 물어볼 상호 후보(최대 4개) — 입력 그대로 → 띄어쓰기 뺀 것 → 법인 표기 바꾼 것 */
export function nameCandidates(input: string, max = 4): string[] {
  const raw = (input || "").trim().replace(/\s+/g, " ");
  if (!raw) return [];
  const bare = raw.replace(CORP_WORDS, "").trim();
  const out = [raw, raw.replace(/\s/g, "")];
  if (bare && bare !== raw) out.push(`주식회사 ${bare}`, `(주)${bare}`, bare);
  return [...new Set(out)].slice(0, max);
}

/** 사장님 유형별로 받아 주는 종목 낱말(국세청에서 확인된 종목에 이 낱말이 들어 있으면 유형에 맞다고 봅니다) */
const KIND_WORDS: Record<OwnerKind, string[]> = {
  lodging: ["숙박", "민박", "펜션", "호텔", "모텔", "여관", "여인숙", "콘도", "리조트", "게스트하우스", "야영", "캠핑", "글램핑", "한옥체험", "스테이"],
  store: [
    "음식", "식당", "한식", "양식", "일식", "중식", "분식", "주점", "맥주", "치킨", "피자", "카페", "커피", "음료", "다과", "디저트",
    "제과", "베이커리", "빵", "아이스크림", "떡", "소매", "도매", "판매", "용품", "상점", "마트", "편의점", "식료품", "전자상거래",
    "애견", "애완", "반려", "동물", "수의", "미용", "훈련", "위탁", "장묘",
    "체험", "공방", "전시", "갤러리", "박물관", "관광", "레저", "여가", "스포츠", "운동", "수영", "농장", "캠핑", "야영",
  ],
};

/** 숙소 낱말이 있어도 사람이 묵는 숙소가 아닌 것(애견호텔·동물 위탁 등)은 숙소로 보지 않습니다 */
const NOT_LODGING = ["애견", "애완", "반려", "동물", "펫"];

/** 확인된 종목이 신청한 유형(가게 / 숙소)에 맞는지 */
export function typeFitsKind(kind: OwnerKind, verifiedType: string): boolean {
  const t = compactText(verifiedType);
  if (!t) return false;
  if (kind === "lodging" && NOT_LODGING.some((w) => t.includes(w))) return false;
  return KIND_WORDS[kind].some((w) => t.includes(w));
}

/** 가게 이름이 같은 곳으로 볼 만큼 비슷한지 — 한쪽이 다른 쪽을 포함하거나, 한두 글자만 다르면 같다고 봅니다 */
export function namesLookSame(a: string, b: string): boolean {
  const norm = (s: string) => (s || "").replace(/\(.*?\)/g, "").replace(CORP_WORDS, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
  const x = norm(a), y = norm(b);
  if (x.length < 2 || y.length < 2) return false;
  if (x.includes(y) || y.includes(x)) return true;
  return editDistance(x, y) <= typoAllowance(Math.min(x.length, y.length));
}
