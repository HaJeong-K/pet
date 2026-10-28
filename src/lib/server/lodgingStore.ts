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

export const PROFILE_COLUMNS = "place_id, check_in, check_out, pet_species, pet_sizes, max_pet_weight_kg, max_pets, pet_fee, pet_fee_note, pet_amenities, pet_rules, stay_rules, refund_policy, updated_at";
/** 4단계 칸(scripts/sql/lodging-settlement.sql) — 없으면 기본값으로 채웁니다 */
export const PROFILE_EXTRA_COLUMNS = "peak_periods, instant_confirm";
export const ROOM_COLUMNS = "id, place_id, name, room_type, description, base_price, weekend_price, std_guests, max_guests, extra_guest_fee, max_pets, images, amenities, is_active, sort_order";

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
  let roomQuery = db.from("lodging_rooms").select(ROOM_COLUMNS).eq("place_id", placeId).order("sort_order").order("id");
  if (onlyActive) roomQuery = roomQuery.eq("is_active", true);
  const profileOf = (columns: string) => db.from("lodging_profiles").select(columns).eq("place_id", placeId).maybeSingle<Record<string, any>>();
  let [profile, rooms] = await Promise.all([profileOf(`${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}`), roomQuery]);
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
      max_pet_weight_kg: profile.data.max_pet_weight_kg == null ? null : Number(profile.data.max_pet_weight_kg),
    } : null,
    rooms: onlyActive && !(await partnerOf(placeId)).open ? [] : (rooms.data ?? []) as unknown as RoomRow[],
  };
}

// ── 3단계: 예약 달력 · 숙박 예약 (scripts/sql/lodging-bookings.sql) ──

export const BOOKING_COLUMNS = "id, place_id, room_id, room_name, guest_name, guest_phone, check_in, check_out, nights, guests, pets, price_detail, total, payment, memo, status, owner_note, decided_at, created_at, updated_at";
/** 4단계 칸(scripts/sql/lodging-settlement.sql) — 결제·취소 환불·이용 확정·문제 접수·정산 */
export const SETTLEMENT_COLUMNS = "booked_on, payment_status, paid_at, cancel_cause, cancelled_at, refund_amount, penalty_amount, compensation_amount, stay_confirmed_at, stay_confirmed_by, issue_status, issue_kind, issue_detail, issue_opened_at, issue_owner_reply, issue_resolution, fee_rate, fee_amount, payout_amount, payout_due_on, payout_status, paid_out_at";
export const BOOKING_FULL_COLUMNS = `${BOOKING_COLUMNS}, ${SETTLEMENT_COLUMNS}`;

/** 그 객실의 바꾼 날(막은 날·날짜별 요금) — from 이상 to 미만 */
export async function roomDays(roomId: number, from: string, to: string): Promise<{ day: string; closed: boolean; price: number | null }[]> {
  const { data, error } = await db.from("lodging_room_days").select("day, closed, price").eq("room_id", roomId).gte("day", from).lt("day", to);
  if (error) throw new Error(error.message);
  return (data ?? []) as { day: string; closed: boolean; price: number | null }[];
}

/** 그 객실의 확정된 예약 중 [checkIn, checkOut)과 겹치는 것(excludeId는 빼고) */
export async function confirmedOverlaps(roomId: number, checkIn: string, checkOut: string, excludeId?: number): Promise<{ id: number; check_in: string; check_out: string }[]> {
  let q = db.from("lodging_bookings").select("id, check_in, check_out").eq("room_id", roomId).eq("status", "confirmed").lt("check_in", checkOut).gt("check_out", checkIn);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: number; check_in: string; check_out: string }[];
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
