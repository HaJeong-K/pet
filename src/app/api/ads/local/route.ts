import { NextRequest, NextResponse } from "next/server";
import { serveBanners } from "@/lib/server/bannerAds";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { GPS_AREAS_MAX, INTEREST_POINTS_MAX, type SearchPoint } from "@/lib/localAds";

// POST /api/ads/local  { sigungu, lat, lng, slots, gpsAreas: ["달서구", …], interests: [{ lat, lng, hits }] }
// 커뮤니티·마이페이지의 배너 광고 칸에 넣을 배너를 slots장 돌려줍니다(PC 양옆 2장, 휴대폰 1장).
// 누구에게 어느 가게가 나가는지는 src/lib/localAds.ts(후보 정하기)와 src/lib/server/bannerAds.ts(고르게 내보내기)를 따릅니다.
//   · gpsAreas: 이 기기에서 GPS를 자주 켠 시·군·구, interests: 최근에 찾아본 지역의 좌표와 찾아본 횟수
//     — 기기에만 기억해 둔 것을 광고를 고를 때만 쓰고 서버에는 저장하지 않습니다.
// 부를 때마다 노출 횟수가 올라가므로(고르게 배분하기 위해) 응답을 캐시하지 않습니다.

export const dynamic = "force-dynamic";
// 한 사람이 1분에 30번까지 — 새로 고침을 반복해 횟수만 올리는 것을 막습니다.
const allow = createRateLimiter({ windowMs: 60_000, max: 30 });

const inKorea = (lat: number, lng: number) => lat >= 32 && lat <= 39.5 && lng >= 124 && lng <= 132.5;

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return NextResponse.json({ tier: "none", places: [] });
  const body = (await req.json().catch(() => ({}))) as { sigungu?: unknown; lat?: unknown; lng?: unknown; slots?: unknown; interests?: unknown; gpsAreas?: unknown };
  const lat = Number(body.lat), lng = Number(body.lng);
  const hasPoint = body.lat != null && body.lng != null && inKorea(lat, lng);
  const interests: SearchPoint[] = (Array.isArray(body.interests) ? body.interests : [])
    .map((p) => ({ lat: Number((p as SearchPoint)?.lat), lng: Number((p as SearchPoint)?.lng), hits: Math.min(100, Math.max(1, Math.floor(Number((p as SearchPoint)?.hits) || 1))) }))
    .filter((p) => inKorea(p.lat, p.lng))
    .slice(0, INTEREST_POINTS_MAX * 2);
  const gpsAreas = (Array.isArray(body.gpsAreas) ? body.gpsAreas : []).filter((a): a is string => typeof a === "string" && a.trim().length >= 2).map((a) => a.trim().slice(0, 30)).slice(0, GPS_AREAS_MAX);
  try {
    const { tier, cards } = await serveBanners({
      sigungu: typeof body.sigungu === "string" ? body.sigungu.slice(0, 30) : null,
      lat: hasPoint ? lat : null, lng: hasPoint ? lng : null, interests, gpsAreas,
    }, Number(body.slots) === 2 ? 2 : 1);
    return NextResponse.json({ tier, places: cards }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[/api/ads/local] failed:", e);
    return NextResponse.json({ tier: "none", places: [] });
  }
}
