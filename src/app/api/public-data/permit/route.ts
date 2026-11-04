import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { lookupPermitPhone } from "@/lib/server/permitEnrich";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

// GET /api/public-data/permit?id= → { phone }
// 공공데이터 장소 상세를 열었는데 전화번호가 비어 있으면, 행정안전부 인허가 데이터에서 같은 가게를 그 자리에서 한 번 찾아봅니다
// (src/lib/server/permitEnrich.ts — 같은 주소·같은 이름일 때만). 찾은 번호는 표에 남아 다음 지도 목록에도 채워집니다.
// 한 번 확인한 곳은 90일 동안 표의 결과만 돌려줘서 하루 한도를 아낍니다.

export const runtime = "nodejs";
export const maxDuration = 60;
const allow = createRateLimiter({ windowMs: 60_000, max: 20 });

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1_000_000_000) return NextResponse.json({ phone: null });
  if (!allow(clientIp(req))) return NextResponse.json({ phone: null });
  const place = ((await getMergedPublicDataPlaces()) as { id: number; name: string; address: string | null; category: string | null; phone: string | null }[]).find((p) => p.id === id);
  if (!place) return NextResponse.json({ phone: null });
  if (place.phone) return NextResponse.json({ phone: place.phone });
  if (!place.address) return NextResponse.json({ phone: null });
  const phone = await lookupPermitPhone({ id: place.id, name: place.name, address: place.address, category: place.category ?? "", phone: null }).catch(() => null);
  // 같은 장소를 여러 사람이 열어도 CDN이 대신 응답합니다(못 찾았으면 한도 때문일 수 있어 1시간만)
  return NextResponse.json({ phone }, { headers: { "Cache-Control": phone ? "public, max-age=3600, s-maxage=86400" : "public, max-age=600, s-maxage=3600" } });
}
