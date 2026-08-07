// ── 국가동물보호정보시스템(animal.go.kr) 보호동물 공고 연동 ──
//
// 1순위: 공공데이터포털(data.go.kr)의 정식 Open API(구조동물 조회 서비스, 인증키 필요).
//   JSON으로 구조화된 데이터를 직접 내려주기 때문에 세션 쿠키나 HTML 마크업 변화에
//   영향을 받지 않아 훨씬 안정적입니다. ANIMAL_OPEN_API_KEY 환경변수가 설정되어 있으면
//   자동으로 이 경로를 씁니다.
// 2순위(폴백): 위 키가 없거나 API 호출이 실패하면, animal.go.kr 공개 목록 페이지를
//   서버에서 그대로 POST 요청해 HTML을 파싱합니다. 세션 쿠키(JSESSIONID)가 필요해서
//   매 요청 전에 GET으로 세션을 먼저 발급받아 쿠키를 실어 보냅니다.
//
// ANIMAL_OPEN_API_KEY 발급 방법: data.go.kr에서 "국가동물보호정보시스템 구조동물 조회
// 서비스"(데이터 15098931) 활용신청 → 승인 후 발급되는 일반 인증키(Decoding)를
// Vercel 환경변수에 ANIMAL_OPEN_API_KEY로 등록하면 됩니다. 몇 분이면 승인됩니다.

// data.go.kr "서비스 정보" 화면에 표시된 End Point 그대로입니다(IP 등록이 필요 없는
// 통합 게이트웨이 주소 — 예전에 쓰던 openapi.animal.go.kr 직접 호출 주소는 IP 화이트리스트가
// 필요해서 Vercel 같은 동적 IP 환경에서는 UNREGISTERED IP ERROR가 났습니다).
const OPEN_API_BASE = "https://apis.data.go.kr/1543061/abandonmentPublicService_v2";

const BASE = "https://www.animal.go.kr";
const LIST_URL = `${BASE}/front/awtis/public/publicList.do`;
export const DETAIL_URL = `${BASE}/front/awtis/public/publicDtl.do`;
export const MENU_NO = "1000000055";

// 정부 사이트 WAF가 "봇처럼 보이는" 요청(User-Agent에 봇 문구, 브라우저가 평소 자동으로
// 붙이는 Accept/Accept-Language/Referer 부재 등)을 차단하는 경우가 많아, 실제 크롬
// 브라우저와 최대한 동일한 헤더 세트를 구성합니다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const COMMON_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

// animal.go.kr은 세션 쿠키(JSESSIONID) 없이 POST 요청을 보내면 404/500을 반환합니다
// (Node의 fetch는 브라우저와 달리 쿠키를 자동으로 유지하지 않으므로, 매번 GET으로
// 먼저 세션을 발급받아 쿠키를 직접 실어 보내야 합니다). 짧게 캐시해서 재사용합니다.
let cachedCookie: { value: string; expires: number } | null = null;

async function getSessionCookie(): Promise<string> {
  if (cachedCookie && cachedCookie.expires > Date.now()) return cachedCookie.value;

  const res = await fetch(`${LIST_URL}?menuNo=${MENU_NO}`, {
    headers: COMMON_HEADERS,
    cache: "no-store",
  });
  const headersAny = res.headers as unknown as { getSetCookie?: () => string[] };
  const rawCookies = typeof headersAny.getSetCookie === "function"
    ? headersAny.getSetCookie()
    : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  const cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");

  cachedCookie = { value: cookie, expires: Date.now() + 5 * 60 * 1000 };
  return cookie;
}

// 카카오 coord2regioncode의 region_1depth_name(예: "경남", "제주")과
// animal.go.kr 검색조건의 시도 코드 매핑. 2026년 기준 전남·광주는 통합 코드 사용.
export const SIDO_CODE_MAP: Record<string, string> = {
  "서울": "6110000",
  "부산": "6260000",
  "대구": "6270000",
  "인천": "6280000",
  "세종": "5690000",
  "대전": "6300000",
  "울산": "6310000",
  "경기": "6410000",
  "강원": "6420000",
  "충북": "6430000",
  "충남": "6440000",
  "전북": "6450000",
  "경북": "6470000",
  "경남": "6480000",
  "제주": "6500000",
  "전남": "6130000",
  "광주": "6130000",
};

export type ShelterNotice = {
  desertionNo: string;
  noticeNumber: string;
  region: string;
  subRegion: string;
  breed: string;
  imageUrl: string;
  intakeDate: string; // YYYY-MM-DD
  deadline: string; // YYYY-MM-DD
  daysLeft: number;
};

// 카드 하나(<a onclick="moveUrl(...)">...</a>)를 찾는 앵커 — 이 위치를 기준으로 다음 카드가
// 시작되기 전까지의 HTML 조각만 잘라내서 그 안에서 이미지/날짜/품종을 찾습니다.
// 예전에는 이미지·날짜·품종을 문서 전체에서 각각 독립적으로 찾은 뒤 순서대로 짝지었는데,
// 사이트 마크업이 아주 조금만 바뀌어도(예: 이미지 alt 문구 변경) 그 필드 하나의 매치 개수가
// 어긋나면서 min(...)이 0이 되어 공고 전체가 통째로 안 뜨는 문제가 있었습니다. 카드 단위로
// 잘라서 찾으면 필드 하나가 안 잡혀도(특히 이미지) 그 카드만 해당 필드가 비고, 나머지는
// 정상적으로 뜹니다.
const LINK_RE = /<a[^>]*onclick="javascript:moveUrl\('(\d+)'\);"[^>]*title="([^"]+?) 자세히 보기"/g;
const IMG_RE = /<img[^>]*src="([^"]+?)"[^>]*alt="공고 번호가[^"]*"/;
const DATE_RE = /<div class="date">\s*<span>([\d-]+)<\/span>\s*<em>(\d+)<\/em>/;
const BREED_RE = /<li class="subject">([^<]*)<\/li>/;

function parseListHtml(html: string): ShelterNotice[] {
  const links: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(html))) links.push(m);

  const notices: ShelterNotice[] = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const start = link.index;
    const end = i + 1 < links.length ? (links[i + 1].index as number) : html.length;
    const chunk = html.slice(start, end);

    const desertionNo = link[1];
    const noticeNumber = link[2];
    const parts = noticeNumber.split("-");
    const region = parts[0] || "";
    const subRegion = parts[1] || "";

    const imgMatch = IMG_RE.exec(chunk);
    const imageUrl = imgMatch
      ? (imgMatch[1].startsWith("http") ? imgMatch[1] : `${BASE}${imgMatch[1]}`)
      : "";

    const dateMatch = DATE_RE.exec(chunk);
    const breedMatch = BREED_RE.exec(chunk);
    const breed = breedMatch ? breedMatch[1].trim() : "";

    // 접수일(공고 시작일)을 못 찾으면 마감임박순 정렬/필터를 계산할 수 없어 이 건은 건너뜁니다.
    if (!dateMatch) continue;
    const yearMonth = dateMatch[1]; // "2026-08"
    const day = dateMatch[2].padStart(2, "0"); // "03"
    const intakeDate = `${yearMonth}-${day}`;

    // 동물보호법 시행규칙상 공고기간은 접수일로부터 10일입니다
    // (상세페이지에서 실측: 구조일 2026-08-03 → 공고기간 2026-08-03~2026-08-13).
    const intake = new Date(`${intakeDate}T00:00:00+09:00`);
    if (isNaN(intake.getTime())) continue;
    const deadlineDate = new Date(intake.getTime() + 10 * 24 * 60 * 60 * 1000);
    const deadline = deadlineDate.toISOString().slice(0, 10);
    const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    notices.push({ desertionNo, noticeNumber, region, subRegion, breed, imageUrl, intakeDate, deadline, daysLeft });
  }

  return notices;
}

// data.go.kr 응답은 XML을 그대로 JSON으로 옮긴 구조라, 결과가 1건일 때 item이 배열이 아니라
// 객체 하나로 오는 경우가 흔합니다(잘 알려진 공공데이터 API 공통 특성) — 항상 배열로 정규화합니다.
function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseOpenApiItems(items: any[]): ShelterNotice[] {
  const notices: ShelterNotice[] = [];
  for (const it of items) {
    const desertionNo = String(it.desertionNo ?? "").trim();
    const noticeNumber = String(it.noticeNo ?? "").trim();
    if (!desertionNo) continue;

    const parts = noticeNumber.split("-");
    const region = parts[0] || "";
    const subRegion = parts[1] || "";

    // "[개] 믹스견" 형태에서 대괄호 축종 표기를 뗍니다.
    const breed = String(it.kindCd ?? "").replace(/^\[[^\]]*\]\s*/, "").trim();
    const imageUrl = String(it.popfile1 ?? it.popfile ?? "").trim();

    const noticeEdt = String(it.noticeEdt ?? "").trim(); // "20260813"
    const noticeSdt = String(it.noticeSdt ?? it.happenDt ?? "").trim();
    const toIso = (yyyymmdd: string) =>
      yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : "";
    const intakeDate = toIso(noticeSdt);
    const deadline = toIso(noticeEdt);
    if (!deadline) continue;

    const deadlineDate = new Date(`${deadline}T23:59:59+09:00`);
    if (isNaN(deadlineDate.getTime())) continue;
    const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    notices.push({ desertionNo, noticeNumber, region, subRegion, breed, imageUrl, intakeDate, deadline, daysLeft });
  }
  return notices;
}

// data.go.kr 인증키는 "Encoding"(이미 %인코딩된 값, 예: ...%2F...%3D%3D)과 "Decoding"
// (원문, +, /, = 등이 그대로 있는 값) 두 가지로 발급됩니다. Decoding 키를 그냥 문자열로
// 붙이면 +가 공백으로 깨지는 등 인증 실패가 나고, 반대로 이미 인코딩된 Encoding 키를
// URLSearchParams에 넣으면 %가 %25로 이중 인코딩되어 역시 인증 실패가 납니다. 어떤 걸
// 붙여넣었는지 자동 판별해서 항상 딱 한 번만 인코딩되도록 처리합니다.
function encodeServiceKey(key: string): string {
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksAlreadyEncoded ? key : encodeURIComponent(key);
}

export type OpenApiDebug = {
  attempted: boolean;
  ok: boolean;
  status?: number;
  resultCode?: string;
  resultMsg?: string;
  itemCount?: number;
  rawSnippet?: string;
  error?: string;
};

let lastOpenApiDebug: OpenApiDebug = { attempted: false, ok: false };
export function getLastOpenApiDebug(): OpenApiDebug {
  return lastOpenApiDebug;
}

async function fetchFromOpenApi(sidoCode: string | null, pageSize: number): Promise<ShelterNotice[] | null> {
  const serviceKey = process.env.ANIMAL_OPEN_API_KEY;
  if (!serviceKey) {
    lastOpenApiDebug = { attempted: false, ok: false, error: "ANIMAL_OPEN_API_KEY 환경변수가 없습니다." };
    return null;
  }

  const today = new Date();
  const toYmd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const bgnde = toYmd(new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)); // 여유 있게 15일 전부터
  const endde = toYmd(today);

  // "공고중" 필터 파라미터명은 문서마다 표기가 갈려서 잘못 넣으면 오히려 0건이 될 수
  // 있어 서버 필터는 빼고, 마감일(daysLeft>=0) 기준 필터링은 sortActive에서 처리합니다.
  const otherParams = new URLSearchParams({
    bgnde,
    endde,
    pageNo: "1",
    numOfRows: String(pageSize),
    _type: "json",
  });
  if (sidoCode) otherParams.set("upr_cd", sidoCode);

  const qs = `serviceKey=${encodeServiceKey(serviceKey)}&${otherParams.toString()}`;

  // data.go.kr 화면에 보이는 "End Point"가 그 자체로 호출 가능한 완전한 주소인 경우도 있고,
  // 그 뒤에 개별 오퍼레이션명을 하나 더 붙여야 하는 경우도 있어(문서화가 서비스마다 다름),
  // 둘 다 순서대로 시도해서 성공하는 쪽을 씁니다.
  const candidates = [OPEN_API_BASE, `${OPEN_API_BASE}/abandonmentPublic_v2`];

  let lastAttemptDebug: OpenApiDebug = { attempted: false, ok: false };

  for (const base of candidates) {
    const url = `${base}?${qs}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        lastAttemptDebug = { attempted: true, ok: false, status: res.status, rawSnippet: text.slice(0, 300) };
        console.error("[shelterNotices] open API fetch failed", url, res.status, text.slice(0, 300));
        continue;
      }
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastAttemptDebug = { attempted: true, ok: false, status: res.status, rawSnippet: text.slice(0, 300), error: "응답이 JSON이 아님" };
        console.error("[shelterNotices] open API가 JSON이 아닌 응답을 줬습니다:", url, text.slice(0, 300));
        continue;
      }
      const header = json?.response?.header;
      if (header && header.resultCode !== "00") {
        lastAttemptDebug = { attempted: true, ok: false, status: res.status, resultCode: header.resultCode, resultMsg: header.resultMsg };
        console.error("[shelterNotices] open API 오류:", url, header.resultCode, header.resultMsg);
        continue;
      }
      const items = toArray(json?.response?.body?.items?.item);
      const notices = parseOpenApiItems(items);
      lastOpenApiDebug = {
        attempted: true, ok: true, status: res.status,
        resultCode: header?.resultCode, resultMsg: header?.resultMsg,
        itemCount: items.length,
      };
      return notices;
    } catch (e) {
      lastAttemptDebug = { attempted: true, ok: false, error: String(e) };
      console.error("[shelterNotices] open API 호출 예외:", url, e);
    }
  }

  lastOpenApiDebug = lastAttemptDebug;
  return null;
}

async function fetchNoticePage(sidoCode: string | null, pageSize = 40): Promise<ShelterNotice[]> {
  // 1순위: 공식 Open API (키가 설정돼 있을 때만)
  const viaOpenApi = await fetchFromOpenApi(sidoCode, pageSize);
  if (viaOpenApi !== null) return viaOpenApi;

  // 2순위: HTML 스크래핑 폴백
  const cookie = await getSessionCookie();
  const body = new URLSearchParams({
    menuNo: MENU_NO,
    page: "1",
    pageSize: String(pageSize),
  });
  if (sidoCode) body.set("searchUprCd", sidoCode);

  const res = await fetch(LIST_URL, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${LIST_URL}?menuNo=${MENU_NO}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!cookie) {
    console.error("[shelterNotices] 세션 쿠키를 못 받아왔습니다 — animal.go.kr이 Set-Cookie를 안 내려줬거나 실행 환경에서 응답 헤더를 못 읽는 상태일 수 있습니다.");
  }
  if (!res.ok) {
    console.error("[shelterNotices] list fetch failed", res.status, sidoCode);
    return [];
  }
  const html = await res.text();
  const notices = parseListHtml(html);
  if (notices.length === 0) {
    console.error(
      "[shelterNotices] list fetch returned 0 parsed items — cookie:", Boolean(cookie),
      ", htmlLen:", html.length,
      ", htmlSnippet:", html.slice(0, 300).replace(/\s+/g, " "),
    );
  }
  return notices;
}

// 상세 공고 원문(HTML)을 그대로 가져옵니다 — 사용자의 브라우저는 animal.go.kr 세션이
// 없어서 직접 POST 폼을 제출하면 실패하므로, 세션이 있는 서버에서 대신 요청한 뒤
// 결과 HTML을 그대로 응답으로 내려줍니다(우리 도메인의 API 라우트가 프록시 역할).
export async function fetchDetailHtml(desertionNo: string): Promise<string | null> {
  const cookie = await getSessionCookie();
  const res = await fetch(DETAIL_URL, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${LIST_URL}?menuNo=${MENU_NO}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams({ menuNo: MENU_NO, desertionNo }).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[shelterNotices] detail fetch failed", res.status, desertionNo);
    return null;
  }
  let html = await res.text();

  // 페이지 안의 상대경로(css/js/이미지)가 우리 도메인이 아니라 animal.go.kr을
  // 기준으로 풀리도록 <base> 태그를 주입합니다.
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head><base href="${BASE}/">`);
  } else {
    html = `<base href="${BASE}/">` + html;
  }
  return html;
}

// 진행 중(마감되지 않은) 공고만 남기고 마감임박순으로 정렬. daysLeft는 이제 실제
// 공고 마감일(noticeEdt) 기준이라(Open API 경로), 상한을 두지 않고 마감 안 된 것만 걸러냅니다.
function sortActive(notices: ShelterNotice[]): ShelterNotice[] {
  return notices
    .filter((n) => n.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// 사용자 지역(시도 짧은 이름, 예: "경남")을 우선으로, 부족하면 전국 공고로 채웁니다.
// offset: 정렬된 결과에서 몇 번째부터 자를지. 커뮤니티 페이지(offset=0, 가장 마감임박인
// 상위 N건)와 마이페이지(offset=N, 그다음 순위 N건)가 서로 다른 공고를 보여주도록
// 하기 위한 용도입니다 — 지역 우선·마감임박순이라는 "주의사항(선정 규칙)"은 완전히
// 동일하게 유지하면서, 순위 구간만 다르게 잘라서 두 페이지에 노출되는 공고가 겹치지
// 않게 합니다.
export async function getPrioritizedShelterNotices(
  regionShort: string | null,
  limit = 2,
  offset = 0
): Promise<ShelterNotice[]> {
  const sidoCode = regionShort ? SIDO_CODE_MAP[regionShort] ?? null : null;

  const regional = sidoCode ? sortActive(await fetchNoticePage(sidoCode)) : [];

  let pool: ShelterNotice[];
  if (regional.length >= offset + limit) {
    pool = regional;
  } else {
    const nationwide = sortActive(await fetchNoticePage(null));
    const seen = new Set(regional.map((n) => n.desertionNo));
    const fill = nationwide.filter((n) => !seen.has(n.desertionNo));
    pool = [...regional, ...fill];
  }

  return pool.slice(offset, offset + limit);
}

// "전국 보호소 공고 전체보기" 전용 페이지(/shelter-notices)에서 씁니다. 사이드 레일의
// 2건 미리보기와 달리, 선택한 지역(없으면 전국) 공고만 마감임박순으로 최대 limit개
// 그대로 보여줍니다 — 다른 지역으로 자동 채워 넣지 않습니다(사용자가 직접 지역을 고름).
export async function getRegionShelterNotices(regionShort: string | null, limit = 60): Promise<ShelterNotice[]> {
  const sidoCode = regionShort ? SIDO_CODE_MAP[regionShort] ?? null : null;
  const notices = sortActive(await fetchNoticePage(sidoCode, Math.max(limit, 60)));
  return notices.slice(0, limit);
}
