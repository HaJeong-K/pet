import { NextRequest, NextResponse } from "next/server";
import { kakaoAddressSearch, kakaoCoordToRegion } from "@/lib/server/kakaoLocal";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";

// GET /api/kakao/local?type=address&query=해운대구
// GET /api/kakao/local?type=region&lat=35.16&lng=129.16
// 브라우저가 카카오 REST 키 없이 주소 검색·지역명 변환을 쓰도록 서버가 대신 호출합니다
// (키는 서버 환경변수에만 있음 — src/lib/server/kakaoLocal.ts 참고).

// 한 사용자가 지도 검색을 연달아 해도 넉넉하고(1분 60회), 외부 반복 호출은 막는 수준입니다.
const allow = createRateLimiter({ windowMs: 60_000, max: 60 });

// 같은 질의는 하루 동안 재사용합니다(지역명·좌표 변환 결과는 거의 안 바뀜) — 카카오 호출 수 절감.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map<string, { at: number; body: unknown }>();

function cached(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
  return undefined;
}
function remember(key: string, body: unknown) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), body });
}

export async function GET(req: NextRequest) {
  if (!allow(clientIp(req))) {
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");

  if (type === "address") {
    const query = (sp.get("query") || "").trim().slice(0, 100);
    if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
    const key = `a:${query}`;
    let body = cached(key);
    if (body === undefined) {
      body = { result: await kakaoAddressSearch(query) };
      remember(key, body);
    }
    return NextResponse.json(body);
  }

  if (type === "region") {
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    // 국내 좌표 범위만 받습니다(엉뚱한 값으로 카카오 호출 낭비 방지).
    if (!(lat >= 32 && lat <= 39.5 && lng >= 124 && lng <= 132.5)) {
      return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
    }
    // 약 100m 단위로 묶어 캐시 — 같은 동네 사용자는 한 번 조회한 결과를 같이 씁니다.
    const key = `r:${lat.toFixed(3)},${lng.toFixed(3)}`;
    let body = cached(key);
    if (body === undefined) {
      body = { result: await kakaoCoordToRegion(lat, lng) };
      remember(key, body);
    }
    return NextResponse.json(body);
  }

  return NextResponse.json({ error: "type must be address or region" }, { status: 400 });
}
