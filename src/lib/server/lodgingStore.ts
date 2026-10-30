// src/lib/server/lodgingStore.ts
//
// 숙소(반려동물 동반 숙박) 서버 쪽 공통 코드(서버 전용).
// lodging_profiles · lodging_rooms 표는 RLS로 막혀 있어서(scripts/sql/lodging.sql) 모든 읽기·쓰기가 여기를 거칩니다.
//   · 누가 고칠 수 있나: 인증된 "숙소" 사장님(본인 숙소), 관리자(?placeId= 로 지정한 숙소)
//   · 누가 볼 수 있나: 누구나 — 단, 손님에게는 판매 중인 객실만
//   · 표가 아직 없으면(SQL 실행 전) 오류 대신 "준비 전(ready: false)"으로 알려 줍니다.

import type { NextRequest } from "next/server";
import { db, isMissingSchema, ownerContext, type OwnerContext } from "@/lib/server/ownerStore";
import { ownerKindOf } from "@/lib/ownerKind";
import type { LodgingProfile, RoomInput } from "@/lib/lodgingRules";
import { icalBlockedDays } from "@/lib/server/lodgingIcal";

export const PROFILE_COLUMNS = "place_id, check_in, check_out, pet_species, pet_sizes, max_pet_weight_kg, max_pets, pet_fee, pet_fee_note, pet_amenities, pet_rules, stay_rules, refund_policy, updated_at";
/** 4단계 칸(scripts/sql/lodging-settlement.sql) — 없으면 기본값으로 채웁니다 */
export const PROFILE_EXTRA_COLUMNS = "peak_periods, instant_confirm";
/** 그 외 동반 동물 칸(scripts/sql/lodging-reviews.sql) */
export const PROFILE_OTHERS_COLUMN = "pet_others";
/** 크기·종류별 반려동물 추가 요금·부가 옵션 칸(scripts/sql/lodging-fees-extras.sql) */
export const PROFILE_FEES_COLUMNS = "pet_fees, extras, pet_free_count, pet_requirements";
export const ROOM_BASE_COLUMNS = "id, place_id, name, room_type, description, base_price, weekend_price, std_guests, max_guests, extra_guest_fee, max_pets, images, amenities, is_active, sort_order";
/** 요일별 요금 칸(scripts/sql/lodging-fees-extras.sql)까지 */
export const ROOM_COLUMNS = `${ROOM_BASE_COLUMNS}, weekday_prices`;

export type ProfileRow = LodgingProfile & { place_id: number; updated_at: string };
export type RoomRow = RoomInput & { id: number; place_id: number; sort_order: number };

/**
 * 숙소 사장님 화면용: 이 요청이 어느 숙소를 다루는지 정합니다(ownerContext와 같고, 사장님이면 "숙소" 유형인지 더 봅니다).
 * 가게 사장님이 숙소 메뉴를 쓰려 하면 막습니다 — 유형을 바꾸려면 관리자에게 요청합니다.
 */
export async function lodgingOwnerContext(req: NextRequest): Promise<OwnerContext | { error: string; status: number }> {
  const ctx = await ownerContext(req);
  if ("error" in ctx || ctx.isAdmin) return ctx;
  const { data } = await db.from("users").select("owner_kind").eq("auth_user_id", ctx.userId).maybeSingle();
  if (ownerKindOf(data?.owner_kind) !== "lodging") return { error: "숙소 사장님 계정에서만 쓸 수 있어요.", status: 403 };
  return ctx;
}

/** 숙소 정보와 객실 목록(사장님이 정한 순서). onlyActive면 판매 중인 객실만 — 손님용이라 입점 승인 전 숙소는 객실을 숨깁니다. */
export async function getLodging(placeId: number, onlyActive: boolean): Promise<{ ready: boolean; profile: ProfileRow | null; rooms: RoomRow[] }> {
  const roomQueryOf = (columns: string) => {
    const q = db.from("lodging_rooms").select(columns).eq("place_id", placeId).order("sort_order").order("id");
    return onlyActive ? q.eq("is_active", true) : q;
  };
  const roomQuery = roomQueryOf(ROOM_COLUMNS);
  const profileOf = (columns: string) => db.from("lodging_profiles").select(columns).eq("place_id", placeId).maybeSingle<Record<string, any>>();
  let [profile, rooms] = await Promise.all([profileOf(`${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}, ${PROFILE_OTHERS_COLUMN}, ${PROFILE_FEES_COLUMNS}`), roomQuery]);
  // 새 칸이 아직 없으면(SQL 실행 전) 한 단계씩 빼고 다시 읽습니다
  if (isMissingSchema(profile.error)) profile = await profileOf(`${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}, ${PROFILE_OTHERS_COLUMN}`);
  // 요일별 요금 칸이 아직 없으면 그 칸 없이
  if (isMissingSchema(rooms.error)) rooms = await roomQueryOf(ROOM_BASE_COLUMNS);
  if (isMissingSchema(profile.error)) profile = await profileOf(`${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}`);
  if (isMissingSchema(profile.error)) profile = await profileOf(PROFILE_COLUMNS);
  if (isMissingSchema(profile.error) || isMissingSchema(rooms.error)) return { ready: false, profile: null, rooms: [] };
  if (profile.error) throw new Error(profile.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  return {
    ready: true,
    profile: profile.data ? {
      ...(profile.data as unknown as ProfileRow),
      // 성수기·즉시 확정 칸이 아직 없으면(SQL 실행 전) 기본값
      peak_periods: Array.isArray(profile.data.peak_periods) ? profile.data.peak_periods : [],
      instant_confirm: profile.data.instant_confirm === true,
      pet_others: typeof profile.data.pet_others === "string" ? profile.data.pet_others : null,
      pet_fees: profile.data.pet_fees && typeof profile.data.pet_fees === "object" && !Array.isArray(profile.data.pet_fees) ? profile.data.pet_fees : {},
      extras: Array.isArray(profile.data.extras) ? profile.data.extras : [],
      pet_free_count: profile.data.pet_free_count == null ? null : Number(profile.data.pet_free_count),
      max_pet_weight_kg: profile.data.max_pet_weight_kg == null ? null : Number(profile.data.max_pet_weight_kg),
    } : null,
    rooms: onlyActive && !(await partnerOf(placeId)).open ? [] : (rooms.data ?? []) as unknown as RoomRow[],
  };
}

// ── 3단계: 예약 달력 · 숙박 예약 (scripts/sql/lodging-bookings.sql) ──

export const BOOKING_COLUMNS = "id, place_id, room_id, room_name, guest_name, guest_phone, check_in, check_out, nights, guests, pets, price_detail, total, payment, memo, status, owner_note, decided_at, created_at, updated_at, stamp_discount";
/** 4단계 칸(scripts/sql/lodging-settlement.sql) — 결제·취소 환불·이용 확정·문제 접수·정산 */
export const SETTLEMENT_COLUMNS = "booked_on, payment_status, paid_at, refund_done_at, cancel_cause, cancelled_at, refund_amount, penalty_amount, compensation_amount, stay_confirmed_at, stay_confirmed_by, issue_status, issue_kind, issue_detail, issue_opened_at, issue_owner_reply, issue_resolution, fee_rate, fee_amount, payout_amount, payout_due_on, payout_status, paid_out_at";
export const BOOKING_FULL_COLUMNS = `${BOOKING_COLUMNS}, ${SETTLEMENT_COLUMNS}`;
/** 이용자 정보·방문 수단(scripts/sql/lodging-guest-review-reports.sql) — 숙소 사장님 화면용 */
export const GUEST_INFO_COLUMNS = "guest_email, stay_guest_name, stay_guest_phone, arrival_method, arrival_time";

/** 그 객실의 바꾼 날(막은 날·날짜별 요금) — from 이상 to 미만 */
export async function roomDays(roomId: number, from: string, to: string, opts: { withIcal?: boolean } = {}): Promise<{ day: string; closed: boolean; price: number | null }[]> {
  const { data, error } = await db.from("lodging_room_days").select("day, closed, price").eq("room_id", roomId).gte("day", from).lt("day", to);
  if (error) throw new Error(error.message);
  const days = (data ?? []) as { day: string; closed: boolean; price: number | null }[];
  if (!opts.withIcal) return days;
  // 손님용: 다른 예약 사이트에서 팔린 밤(달력 연동 — src/lib/server/lodgingIcal.ts)도 막은 날로
  const external = await icalBlockedDays(roomId, from, to);
  if (external.length === 0) return days;
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const day of external) byDay.set(day, { day, closed: true, price: byDay.get(day)?.price ?? null });
  return [...byDay.values()];
}

/** 그 객실의 확정된 예약 중 [checkIn, checkOut)과 겹치는 것(excludeId는 빼고) */
export async function confirmedOverlaps(roomId: number, checkIn: string, checkOut: string, excludeId?: number): Promise<{ id: number; check_in: string; check_out: string }[]> {
  let q = db.from("lodging_bookings").select("id, check_in, check_out").eq("room_id", roomId).eq("status", "confirmed").lt("check_in", checkOut).gt("check_out", checkIn);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: number; check_in: string; check_out: string }[];
}

/**
 * 그 객실에서 날짜를 잡고 있는 예약(확정 + 24시간 안의 확인 대기) 중 [checkIn, checkOut)과 겹치는 것.
 * 24시간이 지난 확인 대기는 매일 새벽 작업·예약 직전 정리(expireStaleRequests)로 자동 취소됩니다.
 */
export async function heldOverlaps(roomId: number, checkIn: string, checkOut: string): Promise<{ id: number; status: string; created_at: string }[]> {
  const { data, error } = await db.from("lodging_bookings").select("id, status, created_at").eq("room_id", roomId).in("status", ["pending_payment", "requested", "confirmed"]).lt("check_in", checkOut).gt("check_out", checkIn);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: number; status: string; created_at: string }[];
}

// ── 입점 상태 (scripts/sql/lodging-partners.sql) ──

/**
 * 그 숙소의 입점 상태. 입점 승인된 숙소만 손님에게 예약이 열립니다.
 * 입점 표가 아직 없으면(SQL 실행 전) 예전처럼 모두 열어 둡니다(open: true, partnerSince: null).
 */
export async function partnerOf(placeId: number): Promise<{ open: boolean; partnerSince: string | null }> {
  const { data, error } = await db.from("lodging_partners").select("partner_since").eq("linked_place_id", placeId).eq("status", "approved").maybeSingle();
  if (error) return isMissingSchema(error) ? { open: true, partnerSince: null } : { open: false, partnerSince: null };
  return { open: !!data, partnerSince: (data?.partner_since as string | null) ?? null };
}
/** 여러 숙소 중 입점 승인된 곳(표가 없으면 null = 모두 허용) */
export async function approvedPartnerIds(placeIds: number[]): Promise<Set<number> | null> {
  if (placeIds.length === 0) return new Set();
  const { data, error } = await db.from("lodging_partners").select("linked_place_id").in("linked_place_id", placeIds).eq("status", "approved");
  if (error) return isMissingSchema(error) ? null : new Set();
  return new Set((data ?? []).map((r) => Number(r.linked_place_id)));
}
