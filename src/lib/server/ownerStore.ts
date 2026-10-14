// src/lib/server/ownerStore.ts
//
// "상품 등록 · 예약 포장" 서버 쪽 공통 코드(서버 전용).
// owner_products · place_reservations 표는 RLS로 막혀 있어서(scripts/sql/owner-store.sql) 모든 읽기·쓰기가 여기를 거칩니다.
//   · 누가 무엇을 볼 수 있나: 상품은 누구나, 예약은 그 가게의 사장님(또는 관리자)과 예약한 본인만.
//   · 표가 아직 없으면(SQL 실행 전) 오류 대신 "준비 전(ready: false)"으로 알려 줍니다.

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { normalizePlan, planAtLeast, type PaidPlanId } from "@/lib/ownerPlans";

export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** 표나 칸이 아직 없어서 난 오류인지(SQL 실행 전) */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST205" || error.code === "PGRST204"
    || /does not exist|schema cache/i.test(error.message || "");
}

/** 로그인한 사용자(없으면 null) */
export async function userOf(req: NextRequest): Promise<{ id: string; email: string | null } | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await db.auth.getUser(token);
  return error || !user ? null : { id: user.id, email: user.email ?? null };
}

export type OwnerContext = { userId: string; placeId: number; isAdmin: boolean };

/**
 * 사장님 화면용: 이 요청이 어느 가게를 다루는지 정합니다.
 *  · 인증된 사장님 → 항상 본인 가게(요청의 placeId는 보지 않음)
 *  · 관리자 → 요청의 placeId(사장님 화면 미리보기·대신 처리)
 */
export async function ownerContext(req: NextRequest): Promise<OwnerContext | { error: string; status: number }> {
  const user = await userOf(req);
  if (!user) return { error: "로그인이 필요해요.", status: 401 };
  const { data: profile } = await db.from("users").select("is_admin, owner_status, owner_place_id").eq("auth_user_id", user.id).maybeSingle();
  if (profile?.owner_status === "verified" && profile?.owner_place_id != null) {
    return { userId: user.id, placeId: Number(profile.owner_place_id), isAdmin: false };
  }
  const requested = Number(req.nextUrl.searchParams.get("placeId"));
  if (profile?.is_admin && Number.isInteger(requested) && requested > 0) return { userId: user.id, placeId: requested, isAdmin: true };
  return { error: "인증된 사장님 계정이 아니에요.", status: 403 };
}

/** 그 가게가 지금 이용 중인 요금제 단계(프리미엄이 아니거나 만료됐으면 null). premium_plan 칸이 아직 없으면 '프리미엄'으로 봅니다. */
export async function activePlanOf(placeId: number): Promise<PaidPlanId | null> {
  let { data, error } = await db.from("places").select("is_premium, premium_expires_at, premium_plan").eq("id", placeId).maybeSingle();
  if (error && isMissingSchema(error)) {
    ({ data, error } = await db.from("places").select("is_premium, premium_expires_at").eq("id", placeId).maybeSingle() as never);
  }
  const place = data as { is_premium?: boolean; premium_expires_at?: string | null; premium_plan?: string | null } | null;
  if (!place?.is_premium || !place.premium_expires_at || new Date(place.premium_expires_at).getTime() <= Date.now()) return null;
  return normalizePlan(place.premium_plan);
}

/** 그 가게가 상품·예약 기능을 쓸 수 있는지('프리미엄 스토어' 이상) */
export async function storeEnabled(placeId: number): Promise<boolean> {
  return planAtLeast(await activePlanOf(placeId), "store");
}

export type ProductRow = { id: number; place_id: number; name: string; description: string | null; price: number; is_active: boolean; sort_order: number };
const PRODUCT_COLUMNS = "id, place_id, name, description, price, is_active, sort_order";

/** 가게의 상품 목록. ready=false면 표가 아직 없음 */
export async function listProducts(placeId: number, onlyActive: boolean): Promise<{ ready: boolean; products: ProductRow[] }> {
  let q = db.from("owner_products").select(PRODUCT_COLUMNS).eq("place_id", placeId).order("sort_order").order("id");
  if (onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    if (isMissingSchema(error)) return { ready: false, products: [] };
    throw new Error(error.message);
  }
  return { ready: true, products: (data ?? []) as ProductRow[] };
}

export const RESERVATION_COLUMNS = "id, place_id, customer_auth_user_id, customer_name, customer_phone, items, total, pickup_at, memo, status, owner_note, created_at, updated_at";
