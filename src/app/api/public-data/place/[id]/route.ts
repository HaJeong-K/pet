import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";

export const runtime = "nodejs";

// ⚠ 장소 상세페이지 로딩 지연 수정: 예전엔 `places` 테이블에 없는(공공데이터 출처)
// 장소를 열 때마다 클라이언트가 fetchPublicDataPlaces()로 "전국 데이터 전체"를
// 받아서 거기서 .find()로 딱 하나만 찾아 썼습니다. 화면엔 "로딩중..."만 뜬 채
// 그 전국 데이터가 도착할 때까지(캐시 없을 때 10초 이상) 기다려야 했던 게 바로
// 이 패턴이었습니다. 이 라우트는 서버가 이미 들고 있는 병합 캐시(getMergedPublicDataPlaces,
// /api/public-data/nearby와 공유)에서 id 하나만 찾아 그 장소 하나만 내려주므로,
// 클라이언트는 필요한 만큼만(장소 하나 분량의 JSON) 받습니다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const placeId = Number(id);
  if (!Number.isFinite(placeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const merged = await getMergedPublicDataPlaces();
  const found = merged.find((p) => p.id === placeId);

  if (!found) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(found);
}
