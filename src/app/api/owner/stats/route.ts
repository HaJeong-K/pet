import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// GET /api/owner/stats[?placeId=123]   (Authorization: Bearer <로그인 토큰>)
// 사장님용 "내 가게 통계" — 조회수·찜·후기·AI 코스 노출 등을 보여줍니다.
// 인증된 사장님은 본인 업장만 볼 수 있고(요청의 placeId는 무시), 관리자는 미리보기용으로 placeId를 지정할 수 있습니다.
// 숫자는 analytics_events(익명 이용 기록)에서 세므로 개인을 식별하는 정보는 내려주지 않습니다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstDay = (ms: number) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

async function countEvents(type: string, placeId: string, sinceIso?: string): Promise<number> {
  let q = supabaseAdmin.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_type", type).eq("place_id", placeId);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  return (await q).count ?? 0;
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "로그인 정보가 올바르지 않아요." }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("users").select("is_admin, owner_status, owner_place_id").eq("auth_user_id", user.id).maybeSingle();
  const isOwner = profile?.owner_status === "verified" && profile?.owner_place_id != null;
  const requested = Number(req.nextUrl.searchParams.get("placeId"));
  const placeIdNum = isOwner ? Number(profile!.owner_place_id) : profile?.is_admin && Number.isFinite(requested) && requested > 0 ? requested : null;
  if (placeIdNum == null) return NextResponse.json({ error: "인증된 사장님 계정이 아니에요." }, { status: 403 });
  const placeId = String(placeIdNum);

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const since7 = new Date(now - 7 * DAY_MS).toISOString();

  const [
    { data: place },
    viewsTotal, views30, views7,
    { data: viewRows },
    bookmarks, likes, reviews,
    courseClicks30, courseDirections30, recClicks30,
    { count: courseIncluded30 },
    { count: recImpressions30 },
    directions30, calls30, website30,
    { data: reviewRows },
  ] = await Promise.all([
    supabaseAdmin.from("places").select("name").eq("id", placeIdNum).maybeSingle(),
    countEvents("place_view", placeId),
    countEvents("place_view", placeId, since30),
    countEvents("place_view", placeId, since7),
    // 일별 추이용(최근 30일) — 시각만 받아 날짜별로 셉니다.
    supabaseAdmin.from("analytics_events").select("created_at").eq("event_type", "place_view").eq("place_id", placeId).gte("created_at", since30).limit(10000),
    supabaseAdmin.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeIdNum).eq("type", "bookmark").then((r) => r.count ?? 0),
    supabaseAdmin.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeIdNum).eq("type", "like").then((r) => r.count ?? 0),
    supabaseAdmin.from("reviews").select("*", { count: "exact", head: true }).eq("place_id", placeIdNum).eq("deleted", false).then((r) => r.count ?? 0),
    countEvents("course_stop_click", placeId, since30),
    countEvents("course_stop_directions", placeId, since30),
    countEvents("rec_click", placeId, since30),
    // AI 코스에 정거장으로 포함돼 노출된 횟수(코스 기록의 stops 목록에 이 장소가 들어 있는 것)
    supabaseAdmin.from("analytics_events").select("*", { count: "exact", head: true })
      .eq("event_type", "course_impression").gte("created_at", since30).contains("meta", { stops: [placeId] }),
    // 추천 장소 목록에 노출된 횟수(추천 기록의 items 목록에 이 장소가 들어 있는 것)
    supabaseAdmin.from("analytics_events").select("*", { count: "exact", head: true })
      .eq("event_type", "rec_impression").gte("created_at", since30).contains("meta", { items: [{ id: placeId }] }),
    // 장소 상세에서 이어진 행동
    countEvents("place_directions", placeId, since30),
    countEvents("place_call", placeId, since30),
    countEvents("place_website", placeId, since30),
    // 후기 관리용: 최근 후기와 사장님 답글 여부(작성자를 알 수 있는 값은 내려주지 않음)
    supabaseAdmin.from("reviews").select("id, nickname, content, created_at, likes").eq("place_id", placeIdNum).eq("deleted", false).eq("is_admin_deleted", false).order("created_at", { ascending: false }).limit(30),
  ]);

  // 후기별 사장님 답글 여부 — is_owner 컬럼이 아직 없으면(SQL 실행 전) 모두 "답글 없음"으로 봅니다.
  const reviewIds = (reviewRows || []).map((r) => r.id);
  const repliedIds = new Set<string>();
  if (reviewIds.length > 0) {
    const { data: ownerReplies } = await supabaseAdmin.from("review_replies").select("review_id").in("review_id", reviewIds).eq("is_owner", true).eq("deleted", false);
    for (const r of ownerReplies || []) repliedIds.add(String(r.review_id));
  }

  const byDay = new Map<string, number>();
  for (const row of viewRows || []) {
    const day = kstDay(new Date(row.created_at).getTime());
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = kstDay(now - (29 - i) * DAY_MS);
    return { day, views: byDay.get(day) ?? 0 };
  });

  return NextResponse.json({
    placeId: placeIdNum,
    placeName: place?.name ?? null,
    views: { total: viewsTotal, last30: views30, last7: views7 },
    daily,
    bookmarks,
    likes,
    reviews,
    last30: {
      courseIncluded: courseIncluded30 ?? 0,
      courseClicks: courseClicks30,
      courseDirections: courseDirections30,
      recommendClicks: recClicks30,
      recommendImpressions: recImpressions30 ?? 0,
      directions: directions30,
      calls: calls30,
      website: website30,
    },
    recentReviews: (reviewRows || []).map((r) => ({ ...r, ownerReplied: repliedIds.has(String(r.id)) })),
  });
}
