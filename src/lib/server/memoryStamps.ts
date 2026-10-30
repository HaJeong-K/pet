// src/lib/server/memoryStamps.ts
//
// 추억 스탬프 서버 쪽(서버 전용) — 발급·사용·되돌리기. 규칙은 src/lib/memoryStamps.ts, 표는 scripts/sql/lodging-holds-stamps.sql.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { kstToday } from "@/lib/lodgingBooking";
import { courseCompleted, STAMPS_ENABLED } from "@/lib/memoryStamps";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { isParkPlaceId } from "@/lib/parkPlace";
import { getParkAsPlace } from "@/lib/server/parkAsPlace";

const PUBLIC_DATA_ID_MIN = 1_000_000_000;

/** 장소 이름·좌표 — 직접 등록(DB)·공공데이터·공원 모두 서버 자료에서 찾습니다(브라우저가 보낸 좌표를 믿지 않음) */
export async function placeLocation(rawId: unknown): Promise<{ id: number; name: string; lat: number; lng: number } | null> {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return null;
  let found: { name?: unknown; lat?: unknown; lng?: unknown } | null | undefined;
  if (isParkPlaceId(id)) found = (await getParkAsPlace(id)) as typeof found;
  else if (id >= PUBLIC_DATA_ID_MIN) found = (await getMergedPublicDataPlaces().catch(() => [])).find((p) => p.id === id) as typeof found;
  else ({ data: found } = await db.from("places").select("name, lat, lng").eq("id", id).maybeSingle());
  const lat = Number(found?.lat), lng = Number(found?.lng);
  if (!found || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { id, name: String(found.name ?? "장소"), lat, lng };
}

/** 아직 쓰지 않은 스탬프 수 */
export async function availableStamps(userId: string): Promise<number> {
  const { count, error } = await db.from("memory_stamps").select("id", { count: "exact", head: true }).eq("auth_user_id", userId).is("spent_booking_id", null);
  if (error) return 0;
  return count ?? 0;
}

/** 스탬프 n개를 예약에 씁니다(오래된 것부터). 실제로 쓴 개수를 돌려줍니다. */
export async function spendStamps(userId: string, bookingId: number, n: number): Promise<number> {
  if (n <= 0) return 0;
  const { data } = await db.from("memory_stamps").select("id").eq("auth_user_id", userId).is("spent_booking_id", null).order("issued_on").order("id").limit(n);
  const ids = (data ?? []).map((r) => Number(r.id));
  if (ids.length === 0) return 0;
  const { data: spent } = await db.from("memory_stamps").update({ spent_booking_id: bookingId, spent_at: new Date().toISOString() })
    .in("id", ids).is("spent_booking_id", null).select("id");
  return spent?.length ?? 0;
}

/** 예약이 취소되면 쓴 스탬프를 돌려줍니다 */
export async function releaseStamps(bookingId: number): Promise<void> {
  const { error } = await db.from("memory_stamps").update({ spent_booking_id: null, spent_at: null }).eq("spent_booking_id", bookingId);
  if (error && !isMissingSchema(error)) console.error("[stamps] 되돌리기 실패:", error.message);
}

/** 숙박 이용이 끝나면 스탬프 1개(예약 하나에 한 번) */
export async function issueStayStamp(bookingId: number): Promise<void> {
  if (!STAMPS_ENABLED) return;
  const { data: b } = await db.from("lodging_bookings").select("guest_auth_user_id, place_id, room_name").eq("id", bookingId).maybeSingle();
  if (!b?.guest_auth_user_id) return;
  const key = `stay:${bookingId}`;
  const { count } = await db.from("memory_stamps").select("id", { count: "exact", head: true }).eq("auth_user_id", b.guest_auth_user_id).eq("place_key", key);
  if ((count ?? 0) > 0) return;
  const { data: place } = await db.from("places").select("name").eq("id", b.place_id).maybeSingle();
  const { error } = await db.from("memory_stamps").insert({ auth_user_id: b.guest_auth_user_id, kind: "stay", place_key: key, title: place?.name ?? b.room_name ?? "숙박", issued_on: kstToday() });
  if (error && !isMissingSchema(error)) console.error("[stamps] 숙박 스탬프 실패:", error.message);
}

type CourseRow = { id: string | number; title: string; stops: { id: string | number; name?: string }[] | null };

/** 저장한 코스들의 진행 상황 — 모든 장소에 다녀왔는데 완주 스탬프가 없으면 새로 발급합니다 */
export async function syncCourseStamps(userId: string): Promise<{ courses: { id: string; title: string; total: number; done: number; completed: boolean }[]; newlyCompleted: string[] }> {
  const [{ data: stamps }, { data: courses, error }] = await Promise.all([
    db.from("memory_stamps").select("place_key").eq("auth_user_id", userId),
    db.from("saved_courses").select("id, title, stops").eq("auth_user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (error) return { courses: [], newlyCompleted: [] };
  const keys = new Set((stamps ?? []).map((s) => String(s.place_key)));
  const newlyCompleted: string[] = [];
  const out = [];
  for (const c of (courses ?? []) as CourseRow[]) {
    const stopIds = (Array.isArray(c.stops) ? c.stops : []).map((s) => String(s.id));
    const completed = courseCompleted(stopIds, keys);
    const key = `course:${c.id}`;
    if (completed && !keys.has(key)) {
      const { error: insertError } = await db.from("memory_stamps").insert({ auth_user_id: userId, kind: "course", place_key: key, title: c.title, issued_on: kstToday() });
      if (!insertError) { keys.add(key); newlyCompleted.push(c.title); }
    }
    out.push({ id: String(c.id), title: c.title, total: stopIds.length, done: stopIds.filter((id) => keys.has(id)).length, completed });
  }
  return { courses: out, newlyCompleted };
}
