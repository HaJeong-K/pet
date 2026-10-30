import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { kstToday, petLabel, type StayPet } from "@/lib/lodgingBooking";
import { canReviewStay, cleanReview, maskName, summarizeReviews, type StayReview } from "@/lib/lodgingReviews";

// 숙박 후기(별점) — scripts/sql/lodging-reviews.sql
//   GET  ?placeId=  → 후기 목록 + 평균 별점. 로그인해서 부르면 내가 후기를 쓸 수 있는 예약(writable)도 함께
//   POST { bookingId, rating, clean_rating?, service_rating?, pet_rating?, content } → 후기 남기기(이용한 손님만, 예약 한 건에 한 개)
//        신고 검토로 후기 작성이 제한된 계정(lodging_review_bans)은 막습니다.
// 사장님 답글·신고는 /api/owner/lodging/reviews, 관리자 검토는 /api/admin/lodging-reviews.
// 표가 아직 없으면 ready: false(빈 목록)로 돌려줍니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const REVIEW_COLUMNS = "id, room_name, guest_display_name, rating, clean_rating, service_rating, pet_rating, content, pets_summary, nights, owner_reply, created_at";

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("숙소를 찾을 수 없어요.", 400);
  const list = (withDeleted: boolean) => {
    let q = db.from("lodging_reviews").select(REVIEW_COLUMNS).eq("place_id", placeId).eq("hidden", false);
    if (withDeleted) q = q.is("deleted_at", null);
    return q.order("created_at", { ascending: false }).limit(200);
  };
  // 신고로 삭제된 후기는 빼고(삭제 칸이 아직 없으면 — scripts/sql/lodging-guest-review-reports.sql 실행 전 — 가린 것만 뺌)
  let { data, error } = await list(true);
  if (error && isMissingSchema(error)) ({ data, error } = await list(false));
  if (error && !isMissingSchema(error)) return fail(error.message, 500);
  const ready = !error;
  const reviews = (data ?? []) as StayReview[];

  // 로그인한 손님이면 아직 후기를 안 쓴, 이용을 마친 예약을 알려 줍니다
  const user = req.headers.get("authorization") ? await userOf(req) : null;
  let writable: { id: number; room_name: string; check_in: string; check_out: string }[] = [];
  const banned = user ? !!(await db.from("lodging_review_bans").select("auth_user_id").eq("auth_user_id", user.id).maybeSingle()).data : false;
  if (user && ready && !banned) {
    const { data: stays } = await db.from("lodging_bookings").select("id, room_name, check_in, check_out, status")
      .eq("place_id", placeId).eq("guest_auth_user_id", user.id).in("status", ["confirmed", "completed"]).lte("check_out", kstToday());
    const ids = (stays ?? []).map((s) => s.id);
    const { data: done } = ids.length ? await db.from("lodging_reviews").select("booking_id").in("booking_id", ids) : { data: [] };
    const reviewed = new Set((done ?? []).map((d) => Number(d.booking_id)));
    writable = (stays ?? []).filter((s) => !reviewed.has(Number(s.id))).map(({ id, room_name, check_in, check_out }) => ({ id, room_name, check_in, check_out }));
  }
  return NextResponse.json({ ready, reviews, summary: summarizeReviews(reviews), writable }, {
    headers: { "Cache-Control": user ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 후기를 남길 수 있어요.", 401);
  const cleaned = cleanReview(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const r = cleaned.review;
  // 신고 검토 결과 숙박 후기 작성이 제한된 계정
  const { data: ban } = await db.from("lodging_review_bans").select("auth_user_id").eq("auth_user_id", user.id).maybeSingle();
  if (ban) return fail("운영 정책 위반으로 숙박 후기를 남길 수 없는 계정이에요. 고객센터로 문의해 주세요.", 403);

  const { data: b, error: findError } = await db.from("lodging_bookings").select("id, place_id, room_name, guest_name, check_out, nights, pets, status")
    .eq("id", r.bookingId).eq("guest_auth_user_id", user.id).maybeSingle();
  if (findError) return fail(findError.message, 500);
  if (!b) return fail("후기를 남길 예약을 찾을 수 없어요.", 404);
  if (!canReviewStay(b, kstToday())) return fail("체크아웃 날부터, 이용한 예약에만 후기를 남길 수 있어요.", 409);

  const pets = (Array.isArray(b.pets) ? b.pets : []) as StayPet[];
  const { data, error } = await db.from("lodging_reviews").insert({
    booking_id: b.id, place_id: b.place_id, room_name: b.room_name, guest_auth_user_id: user.id, guest_display_name: maskName(b.guest_name),
    rating: r.rating, clean_rating: r.clean_rating, service_rating: r.service_rating, pet_rating: r.pet_rating, content: r.content,
    // 이름은 빼고 종류·크기만 보여 줍니다
    pets_summary: pets.map((p) => petLabel({ ...p, name: null })).join(", ") || null, nights: b.nights,
  }).select(REVIEW_COLUMNS).single();
  if (error) {
    if (isMissingSchema(error)) return fail("숙박 후기는 준비 중이에요.", 503);
    if (error.code === "23505") return fail("이 예약에는 이미 후기를 남겼어요.", 409);
    return fail(error.message, 500);
  }
  return NextResponse.json({ review: data });
}
