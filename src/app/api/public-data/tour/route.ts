import { NextRequest, NextResponse } from "next/server";
import { loadTourDetails, petMemo, tidyLines, petZoneFrom, largeDogFrom, extractPhone, type TourDetail } from "@/lib/server/tourDetails";

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
// ── 상세 정보(영업시간/전화/홈페이지/휴무일/주차/입장료/반려동물 동반 조건) ──
// 목록 API(areaBasedList2)에는 제목·주소·좌표·사진만 있습니다. 상세는 src/lib/server/tourDetails.ts가
// 매일 새벽 조금씩 받아 저장소에 쌓아 두고, 여기서는 그 저장분을 읽어 합치기만 합니다(추가 호출 없음).
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

// 공공데이터포털이 응답하지 않을 때 무한정 기다리지 않도록 호출마다 두는 시간 제한
// (예전엔 제한이 없어 외부 API가 멈추면 장소 상세가 "로딩중..."에서 멈췄습니다).
const TOUR_FETCH_TIMEOUT_MS = 8000;

function encodeServiceKey(key: string): string {
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksAlreadyEncoded ? key : encodeURIComponent(key);
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
export async function fetchTourTargets(areaCode = "", maxItems?: number): Promise<any[]> {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) return [];

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

  return list.filter((item: any) => item?.mapx && item?.mapy && item?.contentid);
}

export async function getTourPlaces(areaCode = "", maxItems?: number): Promise<any[]> {
  try {
    const [targets, details] = await Promise.all([fetchTourTargets(areaCode, maxItems), loadTourDetails()]);

    return targets.map((item: any) => {
      const detail: TourDetail | undefined = details[item.contentid];
      // 메모: 반려동물 동반 안내(범위·준비물·주의사항)를 먼저, 그 뒤에 장소 소개를 붙입니다.
      const pet = detail ? petMemo(detail) : null;
      const overview = detail?.overview
        ? detail.overview.length > 300 ? detail.overview.slice(0, 300) + "…" : detail.overview
        : null;
      const memo = [pet, overview].filter(Boolean).join("\n\n");

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
        phone: detail?.phone || extractPhone(item.tel),
        website: detail?.website || null,
        hours: tidyLines(detail?.hours),
        closed_days: tidyLines(detail?.closedDays),
        parking: tidyLines(detail?.parking),
        entry_fee: tidyLines(detail?.entryFee),
        pet_zone: petZoneFrom(detail?.petType ?? null) ?? undefined,
        large_dog: largeDogFrom(detail?.petAnimals ?? null),
        treatable_animals: tidyLines(detail?.petAnimals),
        memo: memo || "한국관광공사 반려동물 동반여행 서비스 제공 정보",
      };
    });
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
