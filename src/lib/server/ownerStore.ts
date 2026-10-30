// src/lib/server/ownerStore.ts
//
// "상품 등록 · 예약 포장" 서버 쪽 공통 코드(서버 전용).
// owner_products · place_reservations 표는 RLS로 막혀 있어서(scripts/sql/owner-store.sql) 모든 읽기·쓰기가 여기를 거칩니다.
//   · 누가 무엇을 볼 수 있나: 상품은 누구나, 예약은 그 가게의 사장님(또는 관리자)과 예약한 본인만.
//   · 표가 아직 없으면(SQL 실행 전) 오류 대신 "준비 전(ready: false)"으로 알려 줍니다.

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { normalizePlan, planAtLeast, type PaidPlanId } from "@/lib/ownerPlans";
import type { OrderType } from "@/lib/storeRules";

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

/** 쇼핑 입점 승인된 가게의 받을 방식 — 입점 전이면 null(표가 없어도 null) */
export async function storePartnerModes(placeId: number): Promise<OrderType[] | null> {
  const { data, error } = await db.from("store_partners").select("order_modes").eq("linked_place_id", placeId).eq("status", "approved").maybeSingle();
  if (error || !data) return null;
  return (data.order_modes ?? ["pickup"]) as OrderType[];
}

/** 그 가게가 주문을 받을 수 있는지 — 쇼핑 입점 승인 또는 '프리미엄 스토어' 이상 */
export async function storeEnabled(placeId: number): Promise<boolean> {
  if (await storePartnerModes(placeId)) return true;
  return planAtLeast(await activePlanOf(placeId), "store");
}

/** 손님이 고를 수 있는 방식 — 입점 가게는 사장님이 고른 방식, 요금제로 열린 가게는 포장만 */
export async function storeOrderModes(placeId: number): Promise<OrderType[]> {
  return (await storePartnerModes(placeId)) ?? ["pickup"];
}

export type ProductRow = {
  id: number; place_id: number; name: string; description: string | null; price: number; is_active: boolean; sort_order: number;
  // 자세한 칸(scripts/sql/owner-products-detail.sql) — 칸이 아직 없으면 비어 있는 값으로 채워 돌려줍니다
  category: string | null; image_url: string | null; unit: string | null; ingredients: string | null; allergy: string | null;
  origin: string | null; caution: string | null; is_featured: boolean; sold_out: boolean;
};
export const PRODUCT_BASE_COLUMNS = "id, place_id, name, description, price, is_active, sort_order";
export const PRODUCT_COLUMNS = `${PRODUCT_BASE_COLUMNS}, category, image_url, unit, ingredients, allergy, origin, caution, is_featured, sold_out`;
const EMPTY_DETAIL = { category: null, image_url: null, unit: null, ingredients: null, allergy: null, origin: null, caution: null, is_featured: false, sold_out: false };

/**
 * 가게의 상품 목록(사장님이 정한 순서).
 *   ready=false       : 상품 표가 아직 없음(owner-store.sql 실행 전)
 *   detailReady=false : 사진·재료 같은 자세한 칸이 아직 없음(owner-products-detail.sql 실행 전) — 기본 칸만으로 동작
 */
export async function listProducts(placeId: number, onlyActive: boolean): Promise<{ ready: boolean; detailReady: boolean; products: ProductRow[] }> {
  const run = (columns: string) => {
    let q = db.from("owner_products").select(columns).eq("place_id", placeId).order("sort_order").order("id");
    if (onlyActive) q = q.eq("is_active", true);
    return q;
  };
  const full = await run(PRODUCT_COLUMNS);
  if (!full.error) return { ready: true, detailReady: true, products: (full.data ?? []) as unknown as ProductRow[] };
  if (!isMissingSchema(full.error)) throw new Error(full.error.message);
  const base = await run(PRODUCT_BASE_COLUMNS);
  if (base.error) {
    if (isMissingSchema(base.error)) return { ready: false, detailReady: false, products: [] };
    throw new Error(base.error.message);
  }
  return { ready: true, detailReady: false, products: ((base.data ?? []) as unknown as ProductRow[]).map((p) => ({ ...EMPTY_DETAIL, ...p })) };
}

export const RESERVATION_COLUMNS = "id, place_id, customer_auth_user_id, customer_name, customer_phone, items, total, pickup_at, memo, status, owner_note, created_at, updated_at, order_type, party_size, payment_status, refund_amount, cancel_request_status, cancel_request_reason, cancel_request_answer";
