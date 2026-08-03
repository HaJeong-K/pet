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
// 버그가 있었습니다(shelterNotices.ts의 animal.go.kr Open API와 동일한 문제였습니다).
// 이번에 두 가지 모두 수정: 올바른 KorPetTourService2 엔드포인트로 변경 + serviceKey는
// 쿼리스트링에 직접 이어붙여 이중 인코딩을 피합니다.
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2";

function encodeServiceKey(key: string): string {
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksAlreadyEncoded ? key : encodeURIComponent(key);
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

    const resultCode = data?.response?.header?.resultCode;
    if (!res.ok || (resultCode && resultCode !== "0" && resultCode !== "00")) {
      console.error("TourAPI 응답 오류:", res.status, resultCode, data?.response?.header?.resultMsg);
      return NextResponse.json([]);
    }

    const items = data?.response?.body?.items?.item ?? [];
    const list = Array.isArray(items) ? items : items ? [items] : [];

    const mapped = list
      .filter((item: any) => item?.mapx && item?.mapy)
      .map((item: any) => ({
        source_id: `tour-${item.contentid}`,
        name: item.title,
        address: item.addr1 || "",
        lat: item.mapy,
        lng: item.mapx,
        category: "반려동반 관광지",
        image_url: item.firstimage || null,
        phone: item.tel || null,
        memo: "한국관광공사 반려동물 동반여행 서비스 제공 정보",
      }));

    return NextResponse.json(mapped);
  } catch (e) {
    console.error("TourAPI fetch 실패:", e);
    return NextResponse.json([]);
  }
}
