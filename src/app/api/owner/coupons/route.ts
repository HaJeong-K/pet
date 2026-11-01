import { NextRequest, NextResponse } from "next/server";
import { db, ownerContext } from "@/lib/server/ownerStore";
import { cleanCoupon, COUPONS_PER_PLACE_MAX } from "@/lib/storeRules";

// 가게 쿠폰(사장님이 만들고 할인 금액도 가게가 부담합니다. 손님 한 명당 쿠폰 하나를 한 번 쓸 수 있습니다)
//   GET    → 쿠폰 목록
//   POST   → 만들기 { name, discount, minOrder, expiresOn }
//   PATCH  → 켜고 끄기 { id, isActive }
//   DELETE → 지우기 ?id=  (이미 쓴 주문의 할인 금액은 그대로 남습니다)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { data, error } = await db.from("store_coupons").select("id, name, discount, min_order, expires_on, is_active").eq("place_id", ctx.placeId).order("id", { ascending: false });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanCoupon(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { count } = await db.from("store_coupons").select("*", { count: "exact", head: true }).eq("place_id", ctx.placeId);
  if ((count ?? 0) >= COUPONS_PER_PLACE_MAX) return fail(`쿠폰은 ${COUPONS_PER_PLACE_MAX}개까지 만들 수 있어요.`, 400);
  const { error } = await db.from("store_coupons").insert([{ place_id: ctx.placeId, ...cleaned.coupon }]);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || typeof body?.isActive !== "boolean") return fail("쿠폰을 찾을 수 없어요.", 400);
  const { error } = await db.from("store_coupons").update({ is_active: body.isActive }).eq("id", id).eq("place_id", ctx.placeId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return fail("쿠폰을 찾을 수 없어요.", 400);
  const { error } = await db.from("store_coupons").delete().eq("id", id).eq("place_id", ctx.placeId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
