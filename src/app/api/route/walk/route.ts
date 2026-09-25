import { NextRequest, NextResponse } from "next/server";

// AI 코스의 실제 도보 경로 조회 — TMAP 보행자 경로안내 API 프록시.
//
// 카카오는 보행자 길찾기 REST API를 공개하지 않아서, 코스 후보를 고를 때는 직선거리×1.3
// 근사치를 씁니다(routeRecommend.ts). 코스가 확정된 뒤 그 3~5개 구간만 여기서 실제 걷는
// 길로 다시 계산해 거리·시간·지도 경로선을 정확하게 바꿉니다 — 후보 수천 개마다 부르는
// 게 아니라 코스당 한 번이라 호출량이 적습니다.
//
// 환경변수 TMAP_APP_KEY(SK open API 발급 키)가 없으면 501을 돌려주고, 클라이언트는
// 기존 근사치를 그대로 보여줍니다(기능이 꺼질 뿐 코스 추천 자체는 정상 동작).
// 호출 제한에 걸리면 429를 돌려주고, 이때도 클라이언트는 추정치를 그대로 씁니다.
//
// 요청: POST { points: [{lat,lng}, ...] }  (출발지 + 정거장들, 2~6개)
// 응답: { legs: [{ km, minutes, path: [[lat,lng], ...] }, ...] }

const TMAP_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1";
const MAX_POINTS = 6;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const REQUEST_TIMEOUT_MS = 6000;

type Pt = { lat: number; lng: number };
type Leg = { km: number; minutes: number; path: [number, number][] };
const legCache = new Map<string, { at: number; leg: Leg }>();

// ── 호출 제한 ──
// 누구나 부를 수 있는 공개 주소라, 제한이 없으면 외부에서 반복 호출해 TMAP 호출 한도를
// 소진시킬 수 있습니다. (1) IP당 10분에 20회, (2) 서버 전체 하루 TMAP_DAILY_LIMIT회
// (기본 800)로 막습니다. 캐시에 있는 구간은 TMAP을 부르지 않으므로 하루 한도에 안 셉니다.
// 메모리 기반이라 서버 인스턴스가 여러 개면 인스턴스별로 따로 셉니다(보수적인 상한 역할).
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_REQUESTS = 20;
const DAILY_LIMIT = Math.max(0, Number(process.env.TMAP_DAILY_LIMIT) || 800);
const ipHits = new Map<string, number[]>();
let daily = { day: "", count: 0 };

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

function allowIp(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX_REQUESTS) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  // 오래된 IP 기록이 계속 쌓이지 않도록 가끔 정리합니다.
  if (ipHits.size > 5000) {
    for (const [key, list] of ipHits) if (list.every((t) => now - t >= IP_WINDOW_MS)) ipHits.delete(key);
  }
  return true;
}

/** 하루 한도 안에서 n회를 예약합니다. 한도를 넘으면 false */
function reserveDaily(n: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count + n > DAILY_LIMIT) return false;
  daily.count += n;
  return true;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const legKey = (a: Pt, b: Pt) =>
  `${round5(a.lat)},${round5(a.lng)}>${round5(b.lat)},${round5(b.lng)}`;

async function fetchLeg(appKey: string, a: Pt, b: Pt): Promise<Leg> {
  const key = legKey(a, b);
  const hit = legCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.leg;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(TMAP_URL, {
      method: "POST",
      headers: { appKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        startX: String(a.lng),
        startY: String(a.lat),
        endX: String(b.lng),
        endY: String(b.lat),
        startName: encodeURIComponent("출발"),
        endName: encodeURIComponent("도착"),
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        searchOption: "0",
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`tmap ${res.status}`);
    const json = await res.json();
    const features: any[] = Array.isArray(json?.features) ? json.features : [];
    const summary = features.find((f) => f?.properties?.totalDistance != null)?.properties;
    if (!summary) throw new Error("tmap: no summary");

    const path: [number, number][] = [];
    for (const f of features) {
      if (f?.geometry?.type !== "LineString" || !Array.isArray(f.geometry.coordinates)) continue;
      for (const [lng, lat] of f.geometry.coordinates) {
        const last = path[path.length - 1];
        if (!last || last[0] !== lat || last[1] !== lng) path.push([lat, lng]);
      }
    }

    const leg: Leg = {
      km: Number(summary.totalDistance) / 1000,
      minutes: Number(summary.totalTime) / 60,
      path,
    };
    if (legCache.size >= CACHE_MAX) {
      const oldest = legCache.keys().next().value;
      if (oldest) legCache.delete(oldest);
    }
    legCache.set(key, { at: Date.now(), leg });
    return leg;
  } finally {
    clearTimeout(timer);
  }
}

const isCoord = (p: any) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export async function POST(req: NextRequest) {
  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) return NextResponse.json({ error: "walk_routing_disabled" }, { status: 501 });

  try {
    const body = await req.json();
    const points = Array.isArray(body?.points) ? body.points : [];
    if (points.length < 2 || points.length > MAX_POINTS || !points.every(isCoord)) {
      return NextResponse.json({ error: "invalid_points" }, { status: 400 });
    }

    if (!allowIp(clientIp(req))) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }

    const pts = points as Pt[];
    const pairs: [Pt, Pt][] = pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]);
    const uncached = pairs.filter(([a, b]) => {
      const hit = legCache.get(legKey(a, b));
      return !hit || Date.now() - hit.at >= CACHE_TTL_MS;
    }).length;
    if (uncached > 0 && !reserveDaily(uncached)) {
      // 하루 한도 소진 — 클라이언트는 기존 추정 거리로 계속 동작합니다.
      return NextResponse.json({ error: "daily_limit_reached" }, { status: 429 });
    }

    const legs = await Promise.all(pairs.map(([a, b]) => fetchLeg(appKey, a, b)));
    return NextResponse.json({ legs });
  } catch (e) {
    console.error("[/api/route/walk] failed:", e);
    return NextResponse.json({ error: "walk_routing_failed" }, { status: 502 });
  }
}
