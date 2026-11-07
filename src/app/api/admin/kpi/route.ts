import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";

// GET /api/admin/kpi?months=12   (관리자 전용)
// 사업 성과 지표 — 월별 지표(DB 함수 kpi_monthly, scripts/sql/kpi-report.sql)와 지금 시점의 누적 현황.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function count(table: string, filter?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

// 기록이 처음 생긴 달(이 달부터 보여 줍니다 — 그 전 달은 모두 0이라 표에서 뺍니다)
const KST = 9 * 3_600_000;
const kstMonth = (iso: string) => new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 7);

// 실제 가입 회원(로그인 계정) — users 표에는 예전 방식의 비회원 기록도 섞여 있어 회원 수로 쓰면 부풀려집니다(2026-11-07 확인: users 68 / 실제 계정 3)
async function authAccounts(): Promise<{ created_at: string }[]> {
  const out: { created_at: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    out.push(...data.users.map((u) => ({ created_at: u.created_at })));
    if (data.users.length < 1000) break;
  }
  return out;
}

// 전체 이용자 수 — 한 번이라도 방문한 회원·비회원(기기) 수, 중복 제거
async function distinctVisitors(): Promise<{ count: number; firstAt: string | null }> {
  const who = new Set<string>();
  let firstAt: string | null = null;
  for (let from = 0; from < 2_000_000; from += 1000) {
    const { data, error } = await supabaseAdmin.from("analytics_events").select("user_key, auth_user_id, created_at").order("id", { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    if (!firstAt) firstAt = data[0].created_at;
    for (const r of data) { const k = r.auth_user_id ?? r.user_key; if (k) who.add(String(k)); }
    if (data.length < 1000) break;
  }
  return { count: who.size, firstAt };
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });

  // 월별 표는 넉넉히(36개월) 받은 뒤, 기록이 처음 생긴 달부터만 남깁니다. 연·월 고르기는 화면에서 합니다.
  const { data: monthlyAll, error } = await supabaseAdmin.rpc("kpi_monthly", { p_months: 36 });
  if (error) {
    const missing = /function .*kpi_monthly|Could not find the function/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "scripts/sql/kpi-report.sql을 Supabase에서 먼저 실행해 주세요." : error.message },
      { status: missing ? 409 : 500 }
    );
  }

  const nowIso = new Date().toISOString();
  const [registeredList, accounts, visitors, ownersVerified, registeredPlaces, premiumActive, reviews, communityPosts, publicPlaces] = await Promise.all([
    // "등록" 장소 = 펫츠로드 DB(places)에 직접 들어온 장소(사장님 등록·제보 승인·관리자 추가). 공공데이터 장소는 빠집니다.
    supabaseAdmin.from("places").select("id, name, category, address, created_at").order("created_at", { ascending: false }).limit(500).then((r) => r.data ?? []),
    authAccounts(),
    distinctVisitors(),
    count("users", (q) => q.eq("owner_status", "verified")),
    count("places"),
    count("places", (q) => q.eq("is_premium", true).gt("premium_expires_at", nowIso)),
    count("reviews", (q) => q.eq("deleted", false)),
    count("community_posts", (q) => q.eq("deleted", false)),
    getMergedPublicDataPlaces().then((list) => list.length).catch(() => 0),
  ]);

  // 신규 가입은 실제 계정 기준으로 다시 셉니다
  const signupsByMonth = new Map<string, number>();
  for (const a of accounts) { const m = kstMonth(a.created_at); signupsByMonth.set(m, (signupsByMonth.get(m) ?? 0) + 1); }
  const firstMonth = visitors.firstAt ? kstMonth(visitors.firstAt) : null;
  const monthly = (monthlyAll ?? [])
    .filter((r: { month: string }) => !firstMonth || r.month >= firstMonth)
    .map((r: { month: string }) => ({ ...r, signups: signupsByMonth.get(r.month) ?? 0 }));

  return NextResponse.json({
    generatedAt: nowIso,
    firstMonth,
    totals: {
      visitors: visitors.count,
      members: accounts.length,
      ownersVerified,
      registeredPlaces,
      publicPlaces,
      totalPlaces: registeredPlaces + publicPlaces,
      premiumActive,
      reviews,
      communityPosts,
    },
    monthly,
    registeredList,
  });
}
