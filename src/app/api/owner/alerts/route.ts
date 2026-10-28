import { NextRequest, NextResponse } from "next/server";
import { db, ownerContext } from "@/lib/server/ownerStore";

// GET /api/owner/alerts — 사장님이 놓치면 안 되는 일의 수(아래 탭바의 빨간 숫자용)
//   reservations: 확인을 기다리는 예약(예약 포장 + 숙박 예약)
//   issues:       손님이 접수한 숙박 문제 중 사장님 의견을 기다리는 것
//   reviews:      최근 14일 동안 달린 장소 후기·숙박 후기 중 사장님 답글이 아직 없는 것
//   total:        모두 더한 값
// 표가 아직 없거나 세지 못한 항목은 0으로 둡니다(알림 숫자가 화면을 막으면 안 됩니다).

const REVIEW_DAYS = 14;
const n = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const since = new Date(Date.now() - REVIEW_DAYS * 86_400_000).toISOString();
  const [orders, stays, issues, recent, stayReviews] = await Promise.all([
    db.from("place_reservations").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("status", "requested"),
    db.from("lodging_bookings").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("status", "requested"),
    db.from("lodging_bookings").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("issue_status", "open").is("issue_owner_reply", null),
    db.from("reviews").select("id").eq("place_id", ctx.placeId).eq("deleted", false).eq("is_admin_deleted", false).gte("created_at", since).limit(100),
    db.from("lodging_reviews").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("hidden", false).is("owner_reply", null).gte("created_at", since),
  ]);
  let reviews = 0;
  const ids = (recent.data ?? []).map((r) => r.id);
  if (!recent.error && ids.length > 0) {
    const { data: replied, error } = await db.from("review_replies").select("review_id").in("review_id", ids).eq("is_owner", true).eq("deleted", false);
    const done = new Set((replied ?? []).map((r) => String(r.review_id)));
    reviews = error ? 0 : ids.filter((id) => !done.has(String(id))).length;
  }
  reviews += n(stayReviews);
  const reservations = n(orders) + n(stays);
  const issueCount = n(issues);
  return NextResponse.json({ reservations, issues: issueCount, reviews, total: reservations + issueCount + reviews }, { headers: { "Cache-Control": "private, no-store" } });
}
