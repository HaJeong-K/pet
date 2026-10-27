import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db } from "@/lib/server/ownerStore";
import { buildTrafficReport, type PageViewRow } from "@/lib/trafficReport";

// 관리자 전용: 유입 경로별 방문·재방문·회원 전환(?days=30 | 90)
// 페이지 조회 기록(analytics_events의 page_view)에 남긴 유입 경로(meta.src·fsrc)로 계산합니다(src/lib/trafficReport.ts).

export const runtime = "nodejs";
const PAGE = 1000;
const MAX_ROWS = 100_000;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const days = req.nextUrl.searchParams.get("days") === "90" ? 90 : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const views: PageViewRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("analytics_events")
      .select("user_key, auth_user_id, created_at, meta")
      .eq("event_type", "page_view").gte("created_at", since)
      .order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    views.push(...((data ?? []) as PageViewRow[]));
    if (!data || data.length < PAGE) break;
  }
  const { data: members } = await db.from("users").select("user_key, created_at").not("auth_user_id", "is", null).limit(50000);

  const report = buildTrafficReport(views, members ?? [], since);
  return NextResponse.json({ days, totalViews: views.length, truncated: views.length >= MAX_ROWS, ...report });
}
