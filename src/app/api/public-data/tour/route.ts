import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// 한국관광공사 반려동물 동반여행 서비스 (KorPetTourService2)
// data.go.kr End Point: https://apis.data.go.kr/B551011/KorPetTourService2
//
// 필요 환경변수: TOUR_API_KEY (data.go.kr에서 발급받은 서비스키, Encoding/Decoding 둘 다 가능
//   — encodeServiceKey()가 이미 인코딩된 키인지 자동 판별합니다)
//   .env.local / Vercel 환경변수에 TOUR_API_KEY=발급받은키 를 추가하면 바로 동작합니다.
//   키가 없으면 빈 배열을 반환해 지도 로딩에는 영향을 주지 않습니다.
//
// 이전 버전은 일반 관광지 API(KorService2)를 잘못 호출하고 있었고, serviceKey를
// URLSearchParams.set()으로 넣어 이미 퍼센트 인코딩된 키가 다시 인코딩되는(이중 인코딩)
// 버그가 있었습니다. 이번에 두 가지 모두 수정: 올바른 KorPetTourService2 엔드포인트로
// 변경 + serviceKey는 쿼리스트링에 직접 이어붙여 이중 인코딩을 피합니다.
//
// ── 상세 정보 보강 (영업시간/전화/홈페이지/휴무일/주차/입장료) ──
// areaBasedList2(목록 API)에는 제목·주소·좌표 정도만 있고 상세 정보가 없어서, 항목마다
// detailCommon2(개요·홈페이지·전화)와 detailIntro2(영업시간·휴무일·주차·요금)를 추가로
// 호출합니다. detailIntro2는 컨텐츠 타입(관광지/음식점/숙박 등)마다 필드명이 다른데
// (TourAPI4.0 공통 규칙), 실제 응답을 직접 호출해 확인할 방법이 없어 잘 알려진 필드명
// 기준으로 매핑했습니다(실제 응답으로 확인 완료 — 매번 찍던 샘플 로그는 운영 로그를 어지럽혀 제거).
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2";

// TourAPI4.0 공통 컨텐츠 타입 코드 — 오랫동안 안 바뀐 고정 코드라 신뢰도 높음
const CONTENT_TYPE_LABEL: Record<string, string> = {
  "12": "관광지",
  "14": "문화시설",
  "15": "축제공연행사",
  "25": "여행코스",
  "28": "레포츠",
  "32": "숙박",
  "38": "쇼핑",
  "39": "음식점",
};

// 한 번 호출에 상세 조회까지 할 최대 건수 — data.go.kr Open API는 보통 일일 호출 한도가
// 있어서(승인 전 기본 1000회/일), 항목 하나당 상세 호출이 2번씩 추가로 나가는 걸 고려해
// 과도하게 쿼터를 소모하지 않도록 제한합니다. 더 넓히고 싶으면 이 값만 올리면 됩니다.
const DETAIL_FETCH_LIMIT = 50;
// 공공데이터포털이 응답하지 않을 때 무한정 기다리지 않도록 호출마다 두는 시간 제한
// (예전엔 제한이 없어 외부 API가 멈추면 장소 상세가 "로딩중..."에서 멈췄습니다).
const TOUR_FETCH_TIMEOUT_MS = 8000;
const DETAIL_CONCURRENCY = 5;

function encodeServiceKey(key: string): string {
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksAlreadyEncoded ? key : encodeURIComponent(key);
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, "").trim();
  return text || null;
}

// 홈페이지 필드가 <a href="URL" target="_blank">텍스트</a> 형태의 HTML 문자열로 오는
// 경우가 많아서, href 속성이 있으면 그걸 우선 쓰고 없으면 태그만 벗겨낸 텍스트를 씁니다.
function extractHomepageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hrefMatch = raw.match(/href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  return stripHtml(raw);
}

async function fetchDetailItem(
  apiKey: string,
  path: "detailCommon2" | "detailIntro2",
  contentId: string,
  contentTypeId?: string
): Promise<any | null> {
  const qs = new URLSearchParams();
  qs.set("MobileOS", "ETC");
  qs.set("MobileApp", "GachiGagae");
  qs.set("_type", "json");
  qs.set("contentId", contentId);
  if (path === "detailCommon2") {
    qs.set("overviewYN", "Y");
    qs.set("defaultYN", "Y");
  }
  if (contentTypeId) qs.set("contentTypeId", contentTypeId);

  const url = `${BASE_URL}/${path}?${qs.toString()}&serviceKey=${encodeServiceKey(apiKey)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TOUR_FETCH_TIMEOUT_MS) });
    const text = await res.text();
    const data = JSON.parse(text);
    const item = data?.response?.body?.items?.item;
    if (!item) return null;
    return Array.isArray(item) ? item[0] : item;
  } catch {
    return null;
  }
}

// contenttypeid별로 영업시간/휴무일/주차/요금 필드명이 다릅니다(TourAPI4.0 공통 규칙).
function extractIntroFields(contentTypeId: string | undefined, intro: any) {
  if (!intro) return { hours: null as string | null, closedDays: null as string | null, parking: null as string | null, entryFee: null as string | null };

  switch (contentTypeId) {
    case "39": // 음식점
      return {
        hours: intro.opentimefood || null,
        closedDays: intro.restdatefood || null,
        parking: intro.parkingfood || null,
        entryFee: intro.discountinfofood || null,
      };
    case "32": { // 숙박
      const checkin = intro.checkintime, checkout = intro.checkouttime;
      return {
        hours: checkin || checkout ? `체크인 ${checkin || "-"} / 체크아웃 ${checkout || "-"}` : null,
        closedDays: null,
        parking: intro.parkinglodging || null,
        entryFee: null,
      };
    }
    case "28": // 레포츠
      return {
        hours: intro.usetimeleports || null,
        closedDays: intro.restdateleports || null,
        parking: intro.parkingleports || null,
        entryFee: intro.usefeeleports || null,
      };
    case "38": // 쇼핑
      return {
        hours: intro.opentime || null,
        closedDays: intro.restdateshopping || null,
        parking: intro.parkingshopping || null,
        entryFee: null,
      };
    case "14": // 문화시설
      return {
        hours: intro.usetimeculture || null,
        closedDays: intro.restdateculture || null,
        parking: intro.parkingculture || null,
        entryFee: intro.usefee || null,
      };
    case "12": // 관광지
    default:
      return {
        hours: intro.usetime || null,
        closedDays: intro.restdate || null,
        parking: intro.parking || null,
        entryFee: intro.usefee || null,
      };
  }
}

// ⚠ /api/public-data/nearby(publicDataPlaces 지역 필터링 집계)가 이 로직을 자기
// GET 핸들러를 HTTP로 다시 호출하지 않고 함수로 직접 재사용할 수 있도록 분리했습니다
// — 서버리스 함수가 자기 자신을 fetch로 호출하는 건 URL 구성(절대경로/헤더)이
// 번거롭고 왕복이 하나 더 늘어나 느려지기만 합니다.
// 목록 API 한 번에 받을 건수(data.go.kr 최대 1000) — 전국 약 9,700건이라 10번이면 전부 받습니다.
const LIST_PAGE_SIZE = 1000;
// 예기치 않게 totalCount가 커져도 호출이 폭주하지 않게 두는 상한
const LIST_MAX_PAGES = 20;

// 공공데이터포털 Open API는 서비스마다 성공 코드 표기가 달라서("0", "00", "0000" 등)
// "0"/"00"만 성공으로 인정하던 이전 코드가 KorPetTourService2의 정상 성공 코드인
// "0000"(resultMsg: "OK")까지 오류로 오판해 매번 빈 배열을 반환하는 버그가 있었습니다.
const SUCCESS_CODES = new Set(["0", "00", "0000"]);

/** 목록 한 페이지 조회. 실패하면 null */
async function fetchListPage(
  apiKey: string,
  areaCode: string,
  pageNo: number,
  numOfRows: number
): Promise<{ items: any[]; totalCount: number } | null> {
  const qs = new URLSearchParams();
  qs.set("numOfRows", String(numOfRows));
  qs.set("pageNo", String(pageNo));
  qs.set("MobileOS", "ETC");
  qs.set("MobileApp", "GachiGagae");
  qs.set("_type", "json");
  qs.set("arrange", "C");
  if (areaCode) qs.set("areaCode", areaCode);

  // serviceKey는 이미 퍼센트 인코딩된 값일 수 있으므로 URLSearchParams가 아니라
  // 쿼리스트링에 직접 이어붙입니다(이중 인코딩 방지).
  const listUrl = `${BASE_URL}/areaBasedList2?${qs.toString()}&serviceKey=${encodeServiceKey(apiKey)}`;

  let res: Response;
  let rawText: string;
  try {
    res = await fetch(listUrl, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TOUR_FETCH_TIMEOUT_MS) });
    rawText = await res.text();
  } catch (e) {
    // 시간 초과·네트워크 오류 — 이 페이지만 건너뜁니다(나머지 페이지는 그대로 씁니다).
    console.error(`TourAPI 목록 ${pageNo}페이지 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("TourAPI 응답이 JSON이 아님:", rawText.slice(0, 300));
    return null;
  }

  const resultCode = data?.response?.header?.resultCode;
  if (!res.ok || (resultCode && !SUCCESS_CODES.has(resultCode))) {
    console.error("TourAPI 응답 오류:", res.status, resultCode, data?.response?.header?.resultMsg);
    return null;
  }

  const items = data?.response?.body?.items?.item ?? [];
  return {
    items: Array.isArray(items) ? items : items ? [items] : [],
    totalCount: Number(data?.response?.body?.totalCount) || 0,
  };
}

/**
 * @param maxItems 받을 최대 건수. 생략하면 전국 전체를 페이지를 넘겨 가며 모두 받습니다.
 * ⚠ 예전엔 pageNo=1·numOfRows=100으로 첫 페이지만 받아서 전국 약 9,700곳 중 100곳(서울 3곳,
 *   부산 5곳)만 지도·AI 코스에 쓰였습니다 — 관광 중심 코스에서 관광공사 선정지가 거의 안 나온 원인.
 */
export async function getTourPlaces(areaCode = "", maxItems?: number): Promise<any[]> {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) return [];

  try {
    const pageSize = maxItems ? Math.min(maxItems, LIST_PAGE_SIZE) : LIST_PAGE_SIZE;
    const first = await fetchListPage(apiKey, areaCode, 1, pageSize);
    if (!first) return [];

    let list = first.items;
    const wanted = maxItems ? Math.min(maxItems, first.totalCount) : first.totalCount;
    const pages = Math.min(LIST_MAX_PAGES, Math.ceil(wanted / pageSize));
    if (pages > 1) {
      // 나머지 페이지는 동시에 받습니다(실패한 페이지는 건너뜀 — 일부라도 보여주는 편이 낫다).
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) => fetchListPage(apiKey, areaCode, i + 2, pageSize))
      );
      for (const page of rest) if (page) list = list.concat(page.items);
    }
    if (maxItems) list = list.slice(0, maxItems);

    const targets = list.filter((item: any) => item?.mapx && item?.mapy && item?.contentid);

    // ── 상세 정보 보강: 앞쪽 DETAIL_FETCH_LIMIT개만 상세 호출 (쿼터 보호), 나머지는 목록
    // 정보(제목/주소/좌표/카테고리)만으로 표시합니다.
    const detailTargets = targets.slice(0, DETAIL_FETCH_LIMIT);
    const detailMap = new Map<string, { overview: string | null; homepage: string | null; tel: string | null; intro: any }>();

    for (let i = 0; i < detailTargets.length; i += DETAIL_CONCURRENCY) {
      const batch = detailTargets.slice(i, i + DETAIL_CONCURRENCY);
      await Promise.all(
        batch.map(async (item: any) => {
          const [common, intro] = await Promise.all([
            fetchDetailItem(apiKey, "detailCommon2", item.contentid),
            fetchDetailItem(apiKey, "detailIntro2", item.contentid, item.contenttypeid),
          ]);
          detailMap.set(item.contentid, {
            overview: common?.overview ? stripHtml(common.overview) : null,
            homepage: extractHomepageUrl(common?.homepage),
            tel: common?.tel || null,
            intro,
          });
        })
      );
    }

    const mapped = targets.map((item: any) => {
      const detail = detailMap.get(item.contentid);
      const introFields = extractIntroFields(item.contenttypeid, detail?.intro);
      const overview = detail?.overview;

      return {
        source_id: `tour-${item.contentid}`,
        name: item.title,
        address: item.addr1 || "",
        lat: item.mapy,
        lng: item.mapx,
        category: CONTENT_TYPE_LABEL[item.contenttypeid] || "반려동반 관광지",
        // 관광공사는 이미지를 http 주소로 주는데, next/image는 https만 허용해서(next.config.ts)
        // 그대로 쓰면 화면 전체가 오류로 멈춥니다. 같은 서버가 https도 지원하므로 바꿔서 씁니다.
        image_url: item.firstimage ? String(item.firstimage).replace(/^http:\/\//, "https://") : null,
        phone: detail?.tel || item.tel || null,
        website: detail?.homepage || null,
        hours: introFields.hours,
        closed_days: introFields.closedDays,
        parking: introFields.parking,
        entry_fee: introFields.entryFee,
        memo: overview
          ? overview.length > 300 ? overview.slice(0, 300) + "…" : overview
          : "한국관광공사 반려동물 동반여행 서비스 제공 정보",
      };
    });

    return mapped;
  } catch (e) {
    console.error("TourAPI fetch 실패:", e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const areaCode = searchParams.get("areaCode") || "";
  // 이 라우트를 직접 부를 때는 기존처럼 기본 100건만 돌려줍니다(전체는 publicDataAggregate가 씀).
  const numOfRows = Number(searchParams.get("numOfRows")) || 100;
  const items = await getTourPlaces(areaCode, numOfRows);
  return NextResponse.json(items);
}
