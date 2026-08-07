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
// 기준으로 매핑했습니다. 혹시 특정 필드가 계속 비어 보이면, 아래 loggedSample 로그가
// 서버 콘솔(`npm run dev` 터미널)에 실제 응답을 한 번 찍어주니 그걸 보고 필드명을
// 바로잡으면 됩니다.
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
    const res = await fetch(url, { next: { revalidate: 3600 } });
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

export async function GET(req: NextRequest) {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(req.url);
  const areaCode = searchParams.get("areaCode") || "";
  const numOfRows = searchParams.get("numOfRows") || "100";

  try {
    const qs = new URLSearchParams();
    qs.set("numOfRows", numOfRows);
    qs.set("pageNo", "1");
    qs.set("MobileOS", "ETC");
    qs.set("MobileApp", "GachiGagae");
    qs.set("_type", "json");
    qs.set("arrange", "C");
    if (areaCode) qs.set("areaCode", areaCode);

    // serviceKey는 이미 퍼센트 인코딩된 값일 수 있으므로 URLSearchParams가 아니라
    // 쿼리스트링에 직접 이어붙입니다(이중 인코딩 방지).
    const listUrl = `${BASE_URL}/areaBasedList2?${qs.toString()}&serviceKey=${encodeServiceKey(apiKey)}`;

    const res = await fetch(listUrl, { next: { revalidate: 3600 } });
    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("TourAPI 응답이 JSON이 아님:", rawText.slice(0, 300));
      return NextResponse.json([]);
    }

    // 공공데이터포털 Open API는 서비스마다 성공 코드 표기가 달라서("0", "00", "0000" 등)
    // "0"/"00"만 성공으로 인정하던 이전 코드가 KorPetTourService2의 정상 성공 코드인
    // "0000"(resultMsg: "OK")까지 오류로 오판해 매번 빈 배열을 반환하는 버그가 있었습니다.
    const resultCode = data?.response?.header?.resultCode;
    const SUCCESS_CODES = new Set(["0", "00", "0000"]);
    if (!res.ok || (resultCode && !SUCCESS_CODES.has(resultCode))) {
      console.error("TourAPI 응답 오류:", res.status, resultCode, data?.response?.header?.resultMsg);
      return NextResponse.json([]);
    }

    const items = data?.response?.body?.items?.item ?? [];
    const list = Array.isArray(items) ? items : items ? [items] : [];
    const targets = list.filter((item: any) => item?.mapx && item?.mapy && item?.contentid);

    // ── 상세 정보 보강: 앞쪽 DETAIL_FETCH_LIMIT개만 상세 호출 (쿼터 보호), 나머지는 목록
    // 정보(제목/주소/좌표/카테고리)만으로 표시합니다.
    const detailTargets = targets.slice(0, DETAIL_FETCH_LIMIT);
    const detailMap = new Map<string, { overview: string | null; homepage: string | null; tel: string | null; intro: any }>();
    let loggedSample = false;

    for (let i = 0; i < detailTargets.length; i += DETAIL_CONCURRENCY) {
      const batch = detailTargets.slice(i, i + DETAIL_CONCURRENCY);
      await Promise.all(
        batch.map(async (item: any) => {
          const [common, intro] = await Promise.all([
            fetchDetailItem(apiKey, "detailCommon2", item.contentid),
            fetchDetailItem(apiKey, "detailIntro2", item.contentid, item.contenttypeid),
          ]);
          if (!loggedSample && intro) {
            // 필드명이 실제 응답과 다르면 여기 로그를 보고 extractIntroFields()를 고치면 됩니다.
            console.log("[TourAPI] detailIntro2 샘플 응답(contenttypeid=" + item.contenttypeid + "):", JSON.stringify(intro));
            loggedSample = true;
          }
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
        image_url: item.firstimage || null,
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

    return NextResponse.json(mapped);
  } catch (e) {
    console.error("TourAPI fetch 실패:", e);
    return NextResponse.json([]);
  }
}
