import { NextRequest, NextResponse } from "next/server";
import { db, ownerContext } from "@/lib/server/ownerStore";
import { bannerRegionOf } from "@/lib/localAds";
import { normalizePlan, PLAN_NAME } from "@/lib/ownerPlans";
import {
  averageMetrics, buildInsights, countMetrics, MIN_BASELINE_DAYS, REPORT_DAYS, REPORT_EVENT_TYPES, scaleTo30, weekdayViews,
  type Metrics, type ReportEvent,
} from "@/lib/ownerReport";

// GET /api/owner/report — 사장님 "성과 보고서" 상세판(인쇄·PDF 저장용). 인증된 사장님은 본인 가게, 관리자는 ?placeId=
//   current/previous: 최근 30일 / 그 전 30일 지표
//   beforePaid: 유료 요금제를 시작하기 전(무료 이용 기간)의 지표를 30일로 환산 — 무료 기간 기록이 7일 이상일 때만
//   peers: 같은 지역(시·군·구 → 시·도 → 전국 순으로 넓힘)·같은 업종의 무료 업체 평균(최근 30일) — 업체 이름은 내려주지 않음
//   daily(30일 조회·클릭), weekday(요일별 조회, 최근 60일), 후기·찜·추천, 자동 작성된 주요 성과·개선 제안
// 숫자는 analytics_events(익명 이용 기록)에서 셉니다.

const DAY = 86_400_000;
const PEERS_MAX = 50;
const PEERS_MIN = 3;
const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const isDefaultImage = (url: unknown) => typeof url !== "string" || !url || /default-place|header_logo/.test(url);

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const placeId = ctx.placeId;
  const now = Date.now();

  const [{ data: place }, { data: approved }] = await Promise.all([
    db.from("places").select("id, name, category, address, image_url, phone, website, is_premium, premium_expires_at, premium_plan, created_at").eq("id", placeId).maybeSingle(),
    db.from("premium_requests").select("plan, months, processed_at").eq("place_id", placeId).eq("status", "approved").order("processed_at", { ascending: true }),
  ]);
  if (!place) return NextResponse.json({ error: "가게를 찾을 수 없어요." }, { status: 404 });
  const paidSinceIso = (approved ?? []).find((r) => r.processed_at)?.processed_at ?? null;
  const paidSince = paidSinceIso ? new Date(paidSinceIso).getTime() : null;

  // 기록은 넉넉히(최근 60일, 유료 시작이 그보다 이르면 그 30일 전부터) 한 번에 받아 나눠 셉니다
  const from = Math.min(now - 2 * REPORT_DAYS * DAY, paidSince ? paidSince - REPORT_DAYS * DAY : Infinity);
  const { data: rows } = await db.from("analytics_events").select("event_type, place_id, created_at, meta")
    .in("event_type", REPORT_EVENT_TYPES).gte("created_at", new Date(from).toISOString()).order("created_at", { ascending: true }).limit(50000);
  const events = (rows ?? []) as ReportEvent[];
  const trackingStart = events.length ? new Date(events[0].created_at).getTime() : now;

  const curFrom = now - REPORT_DAYS * DAY;
  const current = countMetrics(events, placeId, curFrom, now);
  const previous = countMetrics(events, placeId, curFrom - REPORT_DAYS * DAY, curFrom);

  // ① 무료 이용 대비: 유료 시작 전 최대 30일(기록이 있는 날부터) — 7일 이상일 때만
  let beforePaid: { metrics: Metrics; days: number; from: string; to: string } | null = null;
  if (paidSince) {
    const bFrom = Math.max(paidSince - REPORT_DAYS * DAY, trackingStart);
    const days = Math.floor((paidSince - bFrom) / DAY);
    if (days >= MIN_BASELINE_DAYS) beforePaid = { metrics: scaleTo30(countMetrics(events, placeId, bFrom, paidSince), days), days, from: kstDay(bFrom), to: kstDay(paidSince - DAY) };
  }

  // ② 비슷한 무료 업체 평균: 같은 업종, 같은 시·군·구 → 시·도 → 전국
  let peers: { metrics: Metrics; count: number; scope: string } | null = null;
  if (place.category) {
    const { data: candidates } = await db.from("places").select("id, address, is_premium, premium_expires_at").eq("category", place.category).neq("id", placeId).limit(2000);
    const free = (candidates ?? []).filter((p) => !p.is_premium || !p.premium_expires_at || new Date(p.premium_expires_at).getTime() <= now);
    const region = bannerRegionOf(place.address);
    const sido = region.split(" ")[0];
    const scopes: [string, typeof free][] = [
      [`${region} 같은 업종`, free.filter((p) => bannerRegionOf(p.address) === region)],
      [`${sido} 같은 업종`, free.filter((p) => (p.address ?? "").startsWith(sido))],
      ["전국 같은 업종", free],
    ];
    const [scope, list] = scopes.find(([, l]) => l.length >= PEERS_MIN) ?? scopes[2];
    if (list.length > 0) {
      const picked = list.slice(0, PEERS_MAX);
      peers = { metrics: averageMetrics(picked.map((p) => countMetrics(events, Number(p.id), curFrom, now))), count: picked.length, scope };
    }
  }

  // 일별 조회·클릭(30일), 요일별 조회(60일)
  const daily = Array.from({ length: REPORT_DAYS }, (_, i) => {
    const start = curFrom + i * DAY;
    const m = countMetrics(events, placeId, start, start + DAY);
    return { day: kstDay(start), views: m.views, clicks: m.courseClicks + m.recClicks + m.bannerClicks };
  });
  const weekday = weekdayViews(events, placeId, now - 2 * REPORT_DAYS * DAY, now);

  // 후기·찜·추천
  const since30 = new Date(curFrom).toISOString();
  const [{ count: bookmarks }, { count: likes }, { data: reviewRows }] = await Promise.all([
    db.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("type", "bookmark"),
    db.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("type", "like"),
    db.from("reviews").select("id, created_at").eq("place_id", placeId).eq("deleted", false).eq("is_admin_deleted", false).limit(1000),
  ]);
  const reviewIds = (reviewRows ?? []).map((r) => r.id);
  const { data: replied } = reviewIds.length ? await db.from("review_replies").select("review_id").in("review_id", reviewIds).eq("is_owner", true).eq("deleted", false) : { data: [] };
  const repliedCount = new Set((replied ?? []).map((r) => String(r.review_id))).size;
  const reviews = { total: reviewIds.length, last30: (reviewRows ?? []).filter((r) => r.created_at >= since30).length, replied: repliedCount };
  const reviewReplyRate = reviews.total > 0 ? Math.round((repliedCount / reviews.total) * 100) : null;

  const plan = place.is_premium && place.premium_expires_at && new Date(place.premium_expires_at).getTime() > now ? normalizePlan(place.premium_plan) : null;
  const insights = buildInsights({
    current, previous, peers: peers?.metrics ?? null, beforePaid: beforePaid?.metrics ?? null,
    hasPhoto: !isDefaultImage(place.image_url), hasPhone: !!place.phone, hasWebsite: !!place.website, reviewReplyRate, isBannerPlan: plan === "local",
  });

  return NextResponse.json({
    place: { id: place.id, name: place.name, category: place.category, address: place.address },
    plan: plan ? { id: plan, name: PLAN_NAME[plan], expiresAt: place.premium_expires_at } : null,
    paidSince: paidSinceIso,
    period: { from: kstDay(curFrom), to: kstDay(now - DAY), previousFrom: kstDay(curFrom - REPORT_DAYS * DAY), previousTo: kstDay(curFrom - DAY) },
    trackingSince: kstDay(trackingStart),
    current, previous, beforePaid, peers, daily, weekday,
    reactions: { bookmarks: bookmarks ?? 0, likes: likes ?? 0 }, reviews, reviewReplyRate,
    insights, generatedAt: new Date(now).toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
