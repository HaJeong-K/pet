// src/lib/ownerBizInfo.ts
//
// 사장님 인증에 쓰는 사업자 정보(사업자등록번호·대표자명·개업일자) 공용 처리.
// - 사업자등록증 사진을 OCR로 읽은 글자에서 세 값을 뽑아 입력칸을 자동으로 채웁니다.
// - 사업자등록번호 검증 공식(체크섬)으로 오타를 미리 걸러, 국세청 조회를 헛되이 쓰지 않게 합니다.
// 실제 인증 판정은 서버(/api/owner/auto-verify)가 국세청 진위확인으로 합니다 — 이 파일의 OCR 결과는
// 입력 도우미일 뿐 인증 근거로 쓰지 않습니다(브라우저 값은 조작될 수 있음).

export type OwnerBizInfo = {
  /** 하이픈 없는 10자리 */
  bizNo: string;
  /** 대표자 성명 */
  ownerName: string;
  /** 개업일자 YYYYMMDD */
  openDate: string;
};

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** 123-45-67890 형태로 보여주기 */
export function formatBizNo(bizNo: string): string {
  const d = onlyDigits(bizNo).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 국세청 사업자등록번호 검증 공식(가중치 1,3,7,1,3,7,1,3,5) */
export function isValidBizNo(bizNo: string): boolean {
  const d = onlyDigits(bizNo);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** YYYYMMDD가 실제 존재하는 과거 날짜인지 */
export function isValidOpenDate(yyyymmdd: string): boolean {
  if (!/^\d{8}$/.test(yyyymmdd)) return false;
  const y = Number(yyyymmdd.slice(0, 4)), m = Number(yyyymmdd.slice(4, 6)), d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1950 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && date.getTime() <= Date.now();
}

export function isCompleteBizInfo(info: OwnerBizInfo): boolean {
  return isValidBizNo(info.bizNo) && info.ownerName.trim().length >= 2 && isValidOpenDate(info.openDate);
}

const DATE_RE = /(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/;

/**
 * 사업자등록증 OCR 글자에서 사업자번호·대표자명·개업일자를 뽑습니다(못 찾은 값은 빈 문자열).
 * OCR은 한글 사이에 공백을 끼워 넣는 경우가 많아("개 업 연 월 일") 라벨은 공백을 무시하고 찾습니다.
 */
export function parseBizInfoFromOcr(text: string): OwnerBizInfo {
  const src = (text || "").replace(/[|｜]/g, " ");

  let bizNo = "";
  for (const m of src.matchAll(/(\d{3})\s*[-–—~.]?\s*(\d{2})\s*[-–—~.]?\s*(\d{5})/g)) {
    const candidate = m[1] + m[2] + m[3];
    if (isValidBizNo(candidate)) { bizNo = candidate; break; }
    if (!bizNo) bizNo = candidate; // 검증 공식에 안 맞아도(OCR 오인식) 일단 채워 두고 사용자가 고치게
  }

  let ownerName = "";
  const nameMatch = src.match(/(?:성\s*명|대\s*표\s*자)\s*(?:\([^)]*\))?\s*[:：]?\s*([가-힣](?:\s?[가-힣]){1,4})/);
  if (nameMatch) ownerName = nameMatch[1].replace(/\s/g, "");

  let openDate = "";
  const openLabel = src.search(/개\s*업\s*연?\s*월?\s*일?/);
  const dateSource = openLabel >= 0 ? src.slice(openLabel) : src;
  const dm = dateSource.match(DATE_RE);
  if (dm) {
    const candidate = `${dm[1]}${dm[2].padStart(2, "0")}${dm[3].padStart(2, "0")}`;
    if (isValidOpenDate(candidate)) openDate = candidate;
  }

  return { bizNo, ownerName, openDate };
}

/** 가게 이름 비교용 정규화(공백·괄호·특수문자·"주식회사" 등 제거) */
export function normalizeBizName(name: string): string {
  return (name || "")
    .replace(/\(.*?\)/g, "")
    .replace(/주식회사|㈜|\(주\)|유한회사|합자회사/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** 두 가게 이름이 같은 곳으로 볼 만큼 비슷한지(한쪽이 다른 쪽을 포함) */
export function bizNamesMatch(a: string, b: string): boolean {
  const x = normalizeBizName(a), y = normalizeBizName(b);
  if (x.length < 2 || y.length < 2) return false;
  return x.includes(y) || y.includes(x);
}
