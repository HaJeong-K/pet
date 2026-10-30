import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { haversineKm } from "@/lib/geo";
import { kstToday, addDays } from "@/lib/lodgingBooking";
import { STAMP_PLACE_COOLDOWN_DAYS, STAMP_RADIUS_M, STAMP_VALUE_WON, STAMPS_PER_DAY, stampInRange } from "@/lib/memoryStamps";
import { placeLocation, syncCourseStamps } from "@/lib/server/memoryStamps";

// 추억 스탬프 — 로그인한 회원만.
//   GET  → 내 스탬프 목록 · 쓸 수 있는 개수 · 저장한 코스 진행 상황
//   POST → { placeId, lat, lng, accuracy } 장소에 다녀온 인증. 현재 위치는 거리 확인에만 쓰고 저장하지 않습니다.
//          장소 좌표는 서버 자료에서 찾습니다. 코스의 모든 장소를 다녀왔으면 코스 완주 스탬프도 함께 발급합니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const allow = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const { data, error } = await db.from("memory_stamps").select("id, kind, place_key, title, issued_on, spent_booking_id").eq("auth_user_id", user.id).order("issued_on", { ascending: false }).order("id", { ascending: false }).limit(300);
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, stamps: [], available: 0, courses: [] });
    return fail(error.message, 500);
  }
  const { courses } = await syncCourseStamps(user.id);
  const rows = data ?? [];
  const placeId = req.nextUrl.searchParams.get("placeId");
  const since = addDays(kstToday(), -STAMP_PLACE_COOLDOWN_DAYS);
  return NextResponse.json({
    ready: true, value: STAMP_VALUE_WON, stamps: rows, courses,
    available: rows.filter((s) => s.spent_booking_id == null).length,
    // 이 장소에서 최근에 받았는지(버튼 상태)
    stampedHere: placeId ? rows.some((s) => s.place_key === placeId && s.issued_on > since) : false,
  });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인한 뒤 받을 수 있어요.", 401);
  if (!allow(user.id)) return fail("잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat), lng = Number(body?.lng);
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("현재 위치를 확인하지 못했어요.", 400);
  const place = await placeLocation(body?.placeId);
  if (!place) return fail("이 장소는 위치 정보가 없어 인증할 수 없어요.", 404);

  const distanceM = haversineKm(lat, lng, place.lat, place.lng) * 1000;
  if (!stampInRange(distanceM, accuracy)) {
    return fail(`장소 근처에서 받을 수 있어요. (지금 약 ${distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)}km` : `${Math.round(distanceM)}m`} 떨어져 있어요, ${STAMP_RADIUS_M}m 안에서 인증)`, 400);
  }
  const today = kstToday();
  const key = String(place.id);
  const { data: recent, error: recentError } = await db.from("memory_stamps").select("id").eq("auth_user_id", user.id).eq("place_key", key).gt("issued_on", addDays(today, -STAMP_PLACE_COOLDOWN_DAYS)).limit(1);
  if (recentError) return fail(isMissingSchema(recentError) ? "지금은 스탬프를 받을 수 없어요." : recentError.message, isMissingSchema(recentError) ? 503 : 500);
  if ((recent ?? []).length > 0) return fail(`이 장소는 이미 스탬프를 받았어요. ${STAMP_PLACE_COOLDOWN_DAYS}일 뒤에 다시 받을 수 있어요.`, 409);
  const { count } = await db.from("memory_stamps").select("id", { count: "exact", head: true }).eq("auth_user_id", user.id).eq("kind", "place").eq("issued_on", today);
  if ((count ?? 0) >= STAMPS_PER_DAY) return fail(`스탬프는 하루에 ${STAMPS_PER_DAY}개까지 받을 수 있어요.`, 429);

  const { data, error } = await db.from("memory_stamps").insert({ auth_user_id: user.id, kind: "place", place_key: key, title: place.name, issued_on: today }).select("id, kind, title, issued_on").single();
  if (error) return fail(error.code === "23505" ? "오늘 이미 받은 장소예요." : error.message, error.code === "23505" ? 409 : 500);
  const { newlyCompleted } = await syncCourseStamps(user.id);
  return NextResponse.json({ stamp: data, newlyCompleted });
}
