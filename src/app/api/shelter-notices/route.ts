import { NextRequest, NextResponse } from "next/server";
import { getPrioritizedShelterNotices, getRegionShelterNotices, getNearbyShelterNotices, getRegionNoticesWithNearby } from "@/lib/shelterNotices";

// GET /api/shelter-notices?region=경남&limit=2
//   region: 카카오 coord2regioncode의 region_1depth_name (예: "경남", "제주"). 없으면 전국 마감임박순.
//   기본 모드(사이드 레일 미리보기 2건)는 지역 공고가 부족하면 전국 공고로 자동으로 채웁니다.
//
// GET /api/shelter-notices?region=경남&limit=2&offset=2
//   offset: 정렬된 결과에서 몇 번째부터 자를지 — 커뮤니티(offset=0)와 마이페이지(offset=2)가
//   서로 다른 공고를 보여주도록, 선정 규칙(지역 우선·마감임박순)은 그대로 두고 순위 구간만
//   다르게 잘라옵니다.
//
// GET /api/shelter-notices?region=경남&limit=60&full=1
//   전체보기 페이지(/shelter-notices) 전용 — 선택한 지역(없으면 전국) 공고만 마감임박순으로
//   최대 limit개 그대로 반환합니다(다른 지역으로 자동 채우지 않음).
//
// GET /api/shelter-notices?region=경북&sub=포항시 남구&lat=36.01&lng=129.34
//   sub(시·군·구) 또는 lat·lng를 함께 보내면 "내 시·군·구 공고 먼저, 4건이 안 되면 가장 가까운
//   시·군·구 공고를 더하는" 위치 기반 순서로 돌려주고, near에 어떤 지역이 포함됐는지 알려줍니다.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const full = searchParams.get("full") === "1";
  const limit = full
    ? Math.min(Number(searchParams.get("limit")) || 60, 300)
    : Math.min(Number(searchParams.get("limit")) || 2, 6);
  const offset = Math.max(0, Math.min(Number(searchParams.get("offset")) || 0, 20));

  const sub = searchParams.get("sub");
  const latParam = searchParams.get("lat"), lngParam = searchParams.get("lng");
  const lat = latParam != null && latParam !== "" ? Number(latParam) : NaN;
  const lng = lngParam != null && lngParam !== "" ? Number(lngParam) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (region && (sub || hasCoords)) {
    try {
      const area = { sido: region, sigungu: sub, lat: hasCoords ? lat : null, lng: hasCoords ? lng : null };
      const result = full
        ? await getRegionNoticesWithNearby(region, area, limit)
        : await getNearbyShelterNotices(area, limit, offset);
      return NextResponse.json(result);
    } catch (e) {
      console.error("[/api/shelter-notices] nearby failed:", e);
      return NextResponse.json({ notices: [], error: "fetch_failed" }, { status: 200 });
    }
  }

  try {
    const notices = full
      ? await getRegionShelterNotices(region, limit)
      : await getPrioritizedShelterNotices(region, limit, offset);
    return NextResponse.json({ notices });
  } catch (e) {
    console.error("[/api/shelter-notices] failed:", e);
    return NextResponse.json({ notices: [], error: "fetch_failed" }, { status: 200 });
  }
}
