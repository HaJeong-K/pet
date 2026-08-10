import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// 관리자 통계 분석 탭(/admin/analytics)의 집계 데이터를 만드는 라우트입니다.
// analytics_events(트래킹 이벤트)와 users(가입자) 테이블을 service role로 읽어
// 신규 가입자 추이·비회원 이용률·일간/주간/월간 이용자 수·재방문율·검색어 추이·
// 지역별(시/도 → 시/군/구) 인기 장소 TOP10을 서버에서 계산해 내려줍니다.
//
// 쿼리 파라미터:
//   trendFrom, trendTo (YYYY-MM-DD) — 가입자/이용자 추이 기간. 없으면 최근 14일.
//   sido, sigungu — 지역별 인기 장소 드릴다운 필터. 둘 다 없으면 전국 기준.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_MS = 24 * 60 * 60 * 1000;
const dateKey = (iso: string) => iso.slice(0, 10); // YYYY-MM-DD
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

function eachDay(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromKey}T00:00:00Z`);
  const end = new Date(`${toKey}T00:00:00Z`);
  // 안전장치: 너무 넓은 범위(1년 이상)를 요청하면 서버 부하가 커지므로 366일로 제한
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 366) {
    out.push(toISODate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

// 주소 문자열에서 시/도, 시/군/구를 뽑는 로직 — src/lib/analytics.ts의 클라이언트용
// extractRegion/extractSubRegion과 동일한 규칙입니다(이 파일은 서버 라우트라 별도 복제).
const SIDO_ALIASES: [RegExp, string][] = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"],
  [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"],
  [/^충청남|^충남/, "충남"], [/^전북|^전라북/, "전북"], [/^전남|^전라남/, "전남"],
  [/^경북|^경상북/, "경북"], [/^경남|^경상남/, "경남"], [/^제주/, "제주"],
];
function extractRegion(address: string | null | undefined): string {
  if (!address) return "기타";
  const trimmed = address.trim();
  for (const [re, label] of SIDO_ALIASES) {
    if (re.test(trimmed)) return label;
  }
  return "기타";
}
function extractSubRegion(address: string | null | undefined): string {
  if (!address) return "기타";
  const parts = address.trim().split(/\s+/);
  return parts[1] || "기타";
}

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

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const now = Date.now();

    const trendTo = searchParams.get("trendTo") || toISODate(new Date(now));
    const trendFrom = searchParams.get("trendFrom") || toISODate(new Date(now - 13 * DAY_MS));
    const trendDays = eachDay(trendFrom, trendTo);

    const sido = searchParams.get("sido") || null;
    const sigungu = searchParams.get("sigungu") || null;

    const since30 = new Date(now - 30 * DAY_MS).toISOString();
    const since7 = new Date(now - 7 * DAY_MS).toISOString();
    const since1 = new Date(now - 1 * DAY_MS).toISOString();
    // 추이 조회 구간이 30일보다 넓으면 그 구간 전체를 커버하도록 시작점을 늘립니다.
    const trendSinceIso = new Date(`${trendFrom}T00:00:00Z`).toISOString();
    const eventsSinceIso = trendSinceIso < since30 ? trendSinceIso : since30;

    const [
      { data: allUsers },
      { data: events },
      { data: allPlaces },
      { data: hiddenPlaceRows },
    ] = await Promise.all([
      supabaseAdmin.from("users").select("auth_user_id, user_key, created_at"),
      supabaseAdmin
        .from("analytics_events")
        .select("event_type, user_key, auth_user_id, query, place_id, place_name, region, sub_region, created_at")
        .gte("created_at", eventsSinceIso)
        .limit(50000),
      // 지역별 인기 장소 드릴다운 select가 방문 이벤트 유무와 무관하게 항상 동작하도록,
      // 실제 등록된 places의 주소에서 시/도·시/군/구를 뽑아 옵션을 만듭니다.
      // id도 함께 받아서, 삭제된 장소의 예전 방문 기록을 통계에서 걸러내는 데 씁니다.
      supabaseAdmin.from("places").select("id, address").limit(20000),
      // 숨김 처리된 공공데이터 출처 장소(scripts/sql/add-hidden-public-places.sql)도
      // 같은 이유로 걸러내야 합니다.
      supabaseAdmin.from("hidden_public_places").select("place_id"),
    ]);

    const users = allUsers || [];
    const allEvents = events || [];

    // ── 삭제/숨김된 장소는 "인기 장소" 집계에서 제외 ──
    // DB에 실제 행이 있던 장소가 관리자에 의해 삭제되면 places 테이블에서 아예 사라지고,
    // 공공데이터 출처 장소가 숨김 처리되면 hidden_public_places에 올라갑니다. 두 경우 다
    // analytics_events에는 예전 방문 기록(place_id 포함)이 그대로 남아있어서, 아무 조치가
    // 없으면 이미 없어진 장소가 계속 "인기 장소"로 집계되는 문제가 있었습니다.
    const existingPlaceIds = new Set((allPlaces || []).map((p: any) => Number(p.id)));
    const hiddenPlaceIds = new Set((hiddenPlaceRows || []).map((h: any) => Number(h.place_id)));
    // toNumericId(src/lib/publicDataPlaces.ts)가 공공데이터 출처 장소에는 10억 이상의
    // id를 부여하므로, 이 기준으로 "DB 장소"와 "공공데이터 장소"를 구분합니다.
    const PUBLIC_DATA_ID_THRESHOLD = 1_000_000_000;
    // ⚠ analytics_events.place_id는 text 컬럼이라 여기 들어오는 e.place_id는 항상
    // 문자열("1234567890")입니다. existingPlaceIds/hiddenPlaceIds는 숫자 Set이라,
    // Number()로 변환하지 않고 문자열 그대로 .has()를 호출하면 타입이 달라 절대
    // 매칭되지 않습니다(Set은 ===로 비교) — 그 결과 숨김/삭제된 공공데이터 장소가
    // "항상 보임" 취급되어 통계에 계속 잡히는 버그가 있었습니다. 반드시 Number로
    // 맞춰서 비교합니다.
    const isPlaceStillVisible = (placeIdRaw: string | number | null | undefined) => {
      if (placeIdRaw == null) return true; // place_id가 없는 예전 이벤트는 그대로 집계
      const placeId = Number(placeIdRaw);
      if (Number.isNaN(placeId)) return true; // 파싱 불가한 값은 예전처럼 그대로 통과
      if (placeId >= PUBLIC_DATA_ID_THRESHOLD) return !hiddenPlaceIds.has(placeId);
      return existingPlaceIds.has(placeId);
    };
    const events30 = allEvents.filter((e) => e.created_at >= since30);

    // ── 가입자 통계 ──
    const members = users.filter((u) => u.auth_user_id);
    const guests = users.filter((u) => !u.auth_user_id);

    // ── 신규 가입자 추이 (선택 기간, 기본 최근 14일) ──
    const signupsByDay: Record<string, number> = {};
    for (const d of trendDays) signupsByDay[d] = 0;
    for (const u of members) {
      if (!u.created_at) continue;
      const k = dateKey(u.created_at);
      if (k in signupsByDay) signupsByDay[k]++;
    }
    const signupsTrend = trendDays.map((date) => ({ date, count: signupsByDay[date] }));

    // ── 방문자(이용자) 식별 — 로그인 계정은 auth_user_id, 아니면 user_key ──
    const identity = (e: { auth_user_id: string | null; user_key: string | null }) =>
      e.auth_user_id || e.user_key || null;

    const pageViews30 = events30.filter((e) => e.event_type === "page_view");
    const pageViewsAll = allEvents.filter((e) => e.event_type === "page_view");

    const uniqueIn = (sinceIso: string) => {
      const set = new Set<string>();
      for (const e of pageViews30) {
        if (e.created_at >= sinceIso) {
          const id = identity(e);
          if (id) set.add(id);
        }
      }
      return set.size;
    };

    const dau = uniqueIn(since1);
    const wau = uniqueIn(since7);
    const mau = uniqueIn(since30);

    // 선택 기간(기본 14일) 일별 순방문자 추이
    const dailyVisitorsByDay: Record<string, Set<string>> = {};
    for (const d of trendDays) dailyVisitorsByDay[d] = new Set();
    for (const e of pageViewsAll) {
      const k = dateKey(e.created_at);
      const id = identity(e);
      if (k in dailyVisitorsByDay && id) dailyVisitorsByDay[k].add(id);
    }
    const dailyVisitorsTrend = trendDays.map((date) => ({ date, count: dailyVisitorsByDay[date].size }));

    // ── 재방문율 — 최근 30일 안에서 방문한 날짜가 2일 이상인 이용자 비율 ──
    const activeDaysByUser: Record<string, Set<string>> = {};
    for (const e of pageViews30) {
      const id = identity(e);
      if (!id) continue;
      if (!activeDaysByUser[id]) activeDaysByUser[id] = new Set();
      activeDaysByUser[id].add(dateKey(e.created_at));
    }
    const totalActiveUsers = Object.keys(activeDaysByUser).length;
    const returningUsers = Object.values(activeDaysByUser).filter((days) => days.size >= 2).length;
    const retentionRate = totalActiveUsers > 0 ? Math.round((returningUsers / totalActiveUsers) * 1000) / 10 : 0;

    // 비회원 이용률(방문자 기준)
    const guestVisitors = Object.keys(activeDaysByUser).filter(
      (id) => !members.some((m) => m.auth_user_id === id)
    ).length;
    const guestVisitorRate = totalActiveUsers > 0 ? Math.round((guestVisitors / totalActiveUsers) * 1000) / 10 : 0;

    // ── 검색어 추이 TOP 10 (최근 30일 고정) ──
    const searchCounts: Record<string, number> = {};
    for (const e of events30) {
      if (e.event_type !== "search" || !e.query) continue;
      const q = e.query.trim();
      if (!q) continue;
      searchCounts[q] = (searchCounts[q] || 0) + 1;
    }
    const topSearches = Object.entries(searchCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    // ── 지역별 인기 장소 TOP 10 (최근 30일, 시/도 → 시/군구 드릴다운) ──
    const placeViewEvents30 = events30.filter(
      (e) => e.event_type === "place_view" && e.place_name && isPlaceStillVisible(e.place_id)
    );

    // sido가 선택되면 그 안의 시군구 옵션 목록도 같이 내려줘서 프론트가 2단계 select를 구성할 수 있게 합니다.
    // 방문 이벤트(analytics_events)가 아직 쌓이지 않아도 select 자체는 항상 동작하도록,
    // 실제 등록된 places의 주소에서 뽑은 시/군/구를 기본으로 쓰고, 이벤트에서 뽑은 것도 합쳐줍니다.
    const placesInSido = sido
      ? (allPlaces || []).filter((p) => extractRegion(p.address) === sido)
      : [];
    const placeSubRegions = placesInSido
      .map((p) => extractSubRegion(p.address))
      .filter((sr) => sr && sr !== "기타");
    const eventSubRegions = sido
      ? placeViewEvents30.filter((e) => (e.region || "기타") === sido).map((e) => e.sub_region || "기타")
      : [];
    const availableSubRegions = sido
      ? Array.from(new Set([...placeSubRegions, ...eventSubRegions])).sort()
      : [];

    const scoped = placeViewEvents30.filter((e) => {
      if (sido && (e.region || "기타") !== sido) return false;
      if (sigungu && (e.sub_region || "기타") !== sigungu) return false;
      return true;
    });

    const placeCounts: Record<string, { placeName: string; region: string; subRegion: string; count: number }> = {};
    for (const e of scoped) {
      const key = `${e.region || "기타"}|${e.sub_region || "기타"}|${e.place_name}`;
      if (!placeCounts[key]) {
        placeCounts[key] = {
          placeName: e.place_name as string,
          region: e.region || "기타",
          subRegion: e.sub_region || "기타",
          count: 0,
        };
      }
      placeCounts[key].count++;
    }
    const topPlaces = Object.values(placeCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      totals: {
        members: members.length,
        guests: guests.length,
        dau,
        wau,
        mau,
        retentionRate,
        guestVisitorRate,
      },
      trendFrom,
      trendTo,
      signupsTrend,
      dailyVisitorsTrend,
      topSearches,
      topPlaces,
      availableSubRegions,
    });
  } catch (e) {
    console.error("[/api/admin/analytics] failed:", e);
    return NextResponse.json({ error: "집계 실패" }, { status: 500 });
  }
}
