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

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  const months = Math.min(36, Math.max(1, Number(req.nextUrl.searchParams.get("months")) || 12));

  const { data: monthly, error } = await supabaseAdmin.rpc("kpi_monthly", { p_months: months });
  if (error) {
    const missing = /function .*kpi_monthly|Could not find the function/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "scripts/sql/kpi-report.sql을 Supabase에서 먼저 실행해 주세요." : error.message },
      { status: missing ? 409 : 500 }
    );
  }

  const nowIso = new Date().toISOString();
  const [members, ownersVerified, registeredPlaces, premiumActive, reviews, communityPosts, publicPlaces] = await Promise.all([
    count("users"),
    count("users", (q) => q.eq("owner_status", "verified")),
    count("places"),
    count("places", (q) => q.eq("is_premium", true).gt("premium_expires_at", nowIso)),
    count("reviews", (q) => q.eq("deleted", false)),
    count("community_posts", (q) => q.eq("deleted", false)),
    getMergedPublicDataPlaces().then((list) => list.length).catch(() => 0),
  ]);

  return NextResponse.json({
    generatedAt: nowIso,
    totals: {
      members,
      ownersVerified,
      registeredPlaces,
      publicPlaces,
      totalPlaces: registeredPlaces + publicPlaces,
      premiumActive,
      reviews,
      communityPosts,
    },
    monthly: monthly ?? [],
  });
}
