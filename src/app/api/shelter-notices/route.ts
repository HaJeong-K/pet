import { NextRequest, NextResponse } from "next/server";
import { getPrioritizedShelterNotices, getRegionShelterNotices } from "@/lib/shelterNotices";

// GET /api/shelter-notices?region=경남&limit=2
//   region: 카카오 coord2regioncode의 region_1depth_name (예: "경남", "제주"). 없으면 전국 마감임박순.
//   기본 모드(사이드 레일 미리보기 2건)는 지역 공고가 부족하면 전국 공고로 자동으로 채웁니다.
//
// GET /api/shelter-notices?region=경남&limit=60&full=1
//   전체보기 페이지(/shelter-notices) 전용 — 선택한 지역(없으면 전국) 공고만 마감임박순으로
//   최대 limit개 그대로 반환합니다(다른 지역으로 자동 채우지 않음).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const full = searchParams.get("full") === "1";
  const limit = full
    ? Math.min(Number(searchParams.get("limit")) || 60, 100)
    : Math.min(Number(searchParams.get("limit")) || 2, 6);

  try {
    const notices = full
      ? await getRegionShelterNotices(region, limit)
      : await getPrioritizedShelterNotices(region, limit);
    return NextResponse.json({ notices });
  } catch (e) {
    console.error("[/api/shelter-notices] failed:", e);
    return NextResponse.json({ notices: [], error: "fetch_failed" }, { status: 200 });
  }
}
