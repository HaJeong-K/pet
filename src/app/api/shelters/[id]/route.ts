import { NextRequest, NextResponse } from "next/server";
import { getShelterWithNotices } from "@/lib/server/shelterDirectory";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/shelters/{보호센터 번호}
// 보호센터 한 곳의 정보(이름·지역·전화 — 주소는 담지 않음)와 그곳에서 지금 보호 중인 아이들의 공고(마감 임박순).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getShelterWithNotices(decodeURIComponent(id).slice(0, 80));
  if (!found) return NextResponse.json({ error: "보호센터를 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json(found, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400" } });
}
