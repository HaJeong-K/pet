import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { haversineKm } from "@/lib/geo";
import { compactPlace, DEFAULT_CENTER } from "@/lib/mapTile";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

// GET /api/public-data/search?q=올리브영&lat=35.87&lng=128.60
//
// 가게 이름으로 전국 공공데이터 장소를 찾습니다(가까운 순, 최대 60곳).
// 지도는 이제 화면에 보이는 칸의 장소만 갖고 있어서(src/lib/placeTiles.ts), 화면 밖의 가게를 이름으로 찾으려면
// 서버에 물어야 합니다. 예전에는 받아 둔 반경 30km 안에서만 찾을 수 있었는데, 이제 전국에서 찾습니다.
// lat·lng(기준 위치)는 가까운 순 정렬에만 쓰며, 0.1도 단위로만 받습니다(주소에 정확한 위치를 싣지 않도록).

const allow = createRateLimiter({ windowMs: 60_000, max: 60 });
const MAX_RESULTS = 60;

export async function GET(req: NextRequest) {
  if (!allow(clientIp(req))) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim().toLowerCase().slice(0, 40);
  if (q.length < 2) return NextResponse.json([]);

  const latParam = Number(sp.get("lat")), lngParam = Number(sp.get("lng"));
  const hasPoint = sp.get("lat") != null && sp.get("lng") != null && latParam >= 32 && latParam <= 39.5 && lngParam >= 124 && lngParam <= 132.5;
  const lat = hasPoint ? latParam : DEFAULT_CENTER.lat, lng = hasPoint ? lngParam : DEFAULT_CENTER.lng;

  const merged = await getMergedPublicDataPlaces();
  const matches: { place: any; dist: number }[] = [];
  for (const p of merged) {
    if (typeof p.name !== "string" || !p.name.toLowerCase().includes(q)) continue;
    const pLat = parseFloat(p.lat), pLng = parseFloat(p.lng);
    if (isNaN(pLat) || isNaN(pLng)) continue;
    matches.push({ place: p, dist: haversineKm(lat, lng, pLat, pLng) });
  }
  matches.sort((a, b) => a.dist - b.dist);

  // 같은 검색어·같은 동네는 CDN이 5분 동안 대신 응답합니다.
  return NextResponse.json(matches.slice(0, MAX_RESULTS).map((m) => compactPlace(m.place)), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" },
  });
}
