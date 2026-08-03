import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// ⚠ 더 이상 사용되지 않음(DEPRECATED) — 식품안전나라 "반려동물 동반출입 음식점"
// 데이터셋은 실시간 API가 아니라 엑셀 파일 다운로드로만 제공된다는 것이 확인되어,
// culture_facilities와 동일한 방식(엑셀→CSV→Supabase 반입)으로 옮겼습니다.
// 실제 구현은 src/lib/foodsafetyPlaces.ts를 참고하세요. 이 라우트는 더 이상
// publicDataPlaces.ts에서 호출되지 않으며, 남은 코드는 참고용으로만 보존합니다.
// ─────────────────────────────────────────────────────────────
//
// 식품안전나라(식품의약품안전처) — 반려동물 동반출입 음식점
// 포털: foodsafetykorea.go.kr/portal/petKorea.do
//
// 필요 환경변수:
//   FOODSAFETY_API_KEY    공공데이터포털/식품안전나라에서 발급받은 인증키
//   FOODSAFETY_SERVICE_ID 반려동물 동반가능 업소 데이터셋의 서비스 ID
//
// 식품안전나라 Open API는 아래의 고정된 URL 패턴을 사용합니다.
//   http://openapi.foodsafetykorea.go.kr/api/{키}/{서비스ID}/json/{시작행}/{끝행}
//
// ⚠ 검증 필요: 반려동물 동반출입 음식점 데이터셋의 정확한 서비스 ID는 발급받은 계정으로
// foodsafetykorea.go.kr 마이페이지 > Open API 발급현황에서 확인할 수 있습니다. 아래
// FOODSAFETY_SERVICE_ID 기본값은 확인 전 임시값이니, 발급 후 .env.local 에 실제 값으로
// 덮어써주세요. 키가 없으면 빈 배열을 반환해 지도 로딩에는 영향을 주지 않습니다.
// ─────────────────────────────────────────────────────────────

const DEFAULT_SERVICE_ID = "I2790"; // TODO: 실제 발급받은 서비스 ID로 교체 확인

export async function GET(req: NextRequest) {
  const apiKey = process.env.FOODSAFETY_API_KEY;
  const serviceId = process.env.FOODSAFETY_SERVICE_ID || DEFAULT_SERVICE_ID;
  if (!apiKey) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start") || "1";
  const end = searchParams.get("end") || "500";

  try {
    const url = `https://openapi.foodsafetykorea.go.kr/api/${apiKey}/${serviceId}/json/${start}/${end}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error("식품안전나라 API 응답 오류:", res.status);
      return NextResponse.json([]);
    }
    const data = await res.json();
    const body = data?.[serviceId];
    const rows: any[] = body?.row ?? [];

    const mapped = rows
      .filter((row) => row?.LOT_NO || row?.RDNWHLADDR || row?.SITE_ADDR)
      .map((row: any, idx: number) => ({
        source_id: `foodsafety-${row.MGTNO || idx}`,
        name: row.BSSH_NM || row.BIZPLC_NM || "",
        address: row.RDNWHLADDR || row.SITE_ADDR || "",
        lat: row.LAT || row.Y_CRDNT || null,
        lng: row.LOT_NO || row.X_CRDNT || null,
        category: "카페/식당",
        phone: row.TELNO || null,
        memo: "식품안전나라 반려동물 동반출입 음식점 제공 정보",
      }));

    return NextResponse.json(mapped);
  } catch (e) {
    console.error("식품안전나라 fetch 실패:", e);
    return NextResponse.json([]);
  }
}
