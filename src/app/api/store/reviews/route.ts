import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { maskName } from "@/lib/lodgingReviews";
import { canReviewOrder, cleanStoreReview, type ReservationStatus } from "@/lib/storeRules";

// 쇼핑 후기 — 이용 완료한 주문 한 건에 한 개(실제 주문 손님만)
//   GET  ?placeId= → 후기 목록 + 평균 별점
//   POST { reservationId, rating, content }

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const COLUMNS = "id, display_name, order_type, rating, content, owner_reply, created_at";

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("가게를 찾을 수 없어요.", 400);
  const { data, error } = await db.from("store_reviews").select(COLUMNS).eq("place_id", placeId).eq("hidden", false).order("created_at", { ascending: false }).limit(100);
  if (error) return isMissingSchema(error) ? NextResponse.json({ reviews: [], average: null }) : fail(error.message, 500);
  const reviews = data ?? [];
  const average = reviews.length ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 : null;
  return NextResponse.json({ reviews, average }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 후기를 남길 수 있어요.", 401);
  const cleaned = cleanStoreReview(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { data: ban } = await db.from("lodging_review_bans").select("auth_user_id").eq("auth_user_id", user.id).maybeSingle();
  if (ban) return fail("운영 정책 위반으로 후기를 남길 수 없는 계정이에요. 고객센터로 문의해 주세요.", 403);
  const { data: order } = await db.from("place_reservations").select("id, place_id, customer_name, order_type, status, updated_at").eq("id", cleaned.reservationId).eq("customer_auth_user_id", user.id).maybeSingle();
  if (!order) return fail("후기를 남길 주문을 찾을 수 없어요.", 404);
  if (!canReviewOrder(order.status as ReservationStatus, order.updated_at, Date.now())) return fail("이용 완료 후 30일 안에만 후기를 남길 수 있어요.", 409);
  const { data, error } = await db.from("store_reviews").insert([{
    reservation_id: order.id, place_id: order.place_id, auth_user_id: user.id, display_name: maskName(order.customer_name),
    order_type: order.order_type, rating: cleaned.rating, content: cleaned.content,
  }]).select(COLUMNS).single();
  if (error) return fail(error.code === "23505" ? "이 주문에는 이미 후기를 남겼어요." : error.message, error.code === "23505" ? 409 : 500);
  return NextResponse.json({ review: data });
}
