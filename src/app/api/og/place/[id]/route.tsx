import { NextRequest } from "next/server";
import { renderShareCard } from "@/lib/server/ogCard";
import { getPlaceMeta, PET_ZONE_TEXT } from "@/lib/server/placeMeta";

// GET /api/og/place/123 — 장소 공유 카드(사진이 없는 장소용)
// 주소로 글자를 받지 않고 장소 번호로 DB·공공데이터에서 직접 찾아 그립니다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getPlaceMeta(id);
  if (!meta) {
    return renderShareCard({ title: "반려동물과 함께 갈 곳 찾기", subtitle: "같이가개에서 동반 가능한 장소를 확인하세요" });
  }
  return renderShareCard({
    title: meta.name,
    subtitle: meta.address,
    tags: [meta.category, meta.petZone ? PET_ZONE_TEXT[meta.petZone] : null].filter(Boolean) as string[],
  });
}
