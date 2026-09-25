import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// 관리자 통계 분석 탭의 "추천 성과" 섹션 — 추천 장소·AI 코스의 노출/클릭 로그를 A/B
// 그룹(variant)별로 집계합니다. 가중치를 바꾸거나 v2 롤아웃 비율(NEXT_PUBLIC_REC_V2_ROLLOUT)을
// 조정한 뒤 여기서 그룹 간 지표를 비교해 효과를 판단합니다.
//
// 쿼리: days (기본 14, 최대 90)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const BOOKMARK_WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from("users").select("is_admin").eq("auth_user_id", user.id).single();
  return profile?.is_admin ? user : null;
}

type EventRow = {
  event_type: string;
  user_key: string | null;
  auth_user_id: string | null;
  place_id: string | null;
  variant: string | null;
  meta: any;
  created_at: string;
};

const REC_EVENT_TYPES = [
  "rec_impression", "rec_click", "course_impression", "course_regenerate", "course_stop_click", "course_start",
];

async function fetchEvents(sinceIso: string): Promise<EventRow[]> {
  const out: EventRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("analytics_events")
      .select("event_type, user_key, auth_user_id, place_id, variant, meta, created_at")
      .in("event_type", REC_EVENT_TYPES)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...((data as EventRow[]) || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(searchParams.get("days")) || 14));
    const sinceIso = new Date(Date.now() - days * DAY_MS).toISOString();

    let events: EventRow[];
    try {
      events = await fetchEvents(sinceIso);
    } catch {
      // variant/meta 컬럼이 없는 DB(= recommendation-v2.sql 미실행)
      return NextResponse.json({
        error: "scripts/sql/recommendation-v2.sql을 Supabase에서 먼저 실행해야 추천 성과를 집계할 수 있습니다.",
      }, { status: 200 });
    }

    // 추천 클릭 후 24시간 안에 같은 장소를 찜했는지(찜 전환) — reactions.created_at이 있어야 계산됩니다.
    let bookmarks: { place_id: string | number; user_key: string; created_at: string }[] = [];
    {
      const { data, error } = await supabaseAdmin
        .from("reactions")
        .select("place_id, user_key, created_at")
        .eq("type", "bookmark")
        .gte("created_at", sinceIso)
        .limit(50000);
      if (!error && data) bookmarks = data as any;
    }
    const bookmarkIndex = new Map<string, number[]>();
    for (const b of bookmarks) {
      const key = `${b.user_key}|${b.place_id}`;
      const list = bookmarkIndex.get(key) ?? [];
      list.push(new Date(b.created_at).getTime());
      bookmarkIndex.set(key, list);
    }

    const variants = Array.from(new Set(events.map((e) => e.variant || "unknown"))).sort();
    const byVariant = variants.map((variant) => {
      const ev = events.filter((e) => (e.variant || "unknown") === variant);
      const count = (type: string) => ev.filter((e) => e.event_type === type).length;
      const users = (type: string) =>
        new Set(ev.filter((e) => e.event_type === type).map((e) => e.auth_user_id || e.user_key).filter(Boolean)).size;

      const recImpressions = count("rec_impression");
      const recClicksAll = ev.filter((e) => e.event_type === "rec_click");
      const recClicks = recClicksAll.filter((e) => e.meta?.slot !== "ad");
      const adClicks = recClicksAll.filter((e) => e.meta?.slot === "ad").length;
      const adImpressions = ev.filter((e) => e.event_type === "rec_impression" && e.meta?.ad).length;

      // 클릭 위치 분포(1~10위) — 위쪽에 클릭이 몰리는 정도(위치 편향) 확인용
      const positionClicks = Array.from({ length: 10 }, (_, i) => ({
        pos: i + 1,
        clicks: recClicks.filter((e) => Number(e.meta?.pos) === i + 1).length,
      }));

      const converted = recClicksAll.filter((e) => {
        const clickAt = new Date(e.created_at).getTime();
        const keys = [e.user_key, e.auth_user_id].filter(Boolean);
        return keys.some((k) =>
          (bookmarkIndex.get(`${k}|${e.place_id}`) ?? []).some((t) => t >= clickAt && t - clickAt <= BOOKMARK_WINDOW_MS)
        );
      }).length;

      const courseImpressions = count("course_impression");
      return {
        variant,
        rec: {
          impressions: recImpressions,
          users: users("rec_impression"),
          clicks: recClicks.length,
          ctr: pct(recClicks.length, recImpressions),
          adImpressions,
          adClicks,
          adCtr: pct(adClicks, adImpressions),
          bookmarkConversions: converted,
          bookmarkConversionRate: pct(converted, recClicksAll.length),
          positionClicks,
        },
        course: {
          impressions: courseImpressions,
          users: users("course_impression"),
          regenerates: count("course_regenerate"),
          regenerateRate: pct(count("course_regenerate"), courseImpressions),
          stopClicks: count("course_stop_click"),
          starts: count("course_start"),
          startRate: pct(count("course_start"), courseImpressions),
          tmapShare: pct(
            ev.filter((e) => e.event_type === "course_impression" && e.meta?.distanceSource === "tmap").length,
            courseImpressions
          ),
        },
      };
    });

    return NextResponse.json({ days, byVariant, bookmarkTracking: bookmarks.length > 0 || events.length === 0 });
  } catch (e) {
    console.error("[/api/admin/recommend-metrics] failed:", e);
    return NextResponse.json({ error: "추천 성과 집계 실패" }, { status: 500 });
  }
}
