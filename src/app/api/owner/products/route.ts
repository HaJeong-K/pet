import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, listProducts, ownerContext, storeEnabled } from "@/lib/server/ownerStore";
import { cleanProduct, PRODUCTS_PER_PLACE_MAX } from "@/lib/storeRules";

// 사장님의 상품 관리(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET    → 상품 목록(꺼 둔 것 포함) + 이 가게가 상품·예약 기능을 쓸 수 있는지(enabled)
//   POST   → 상품 추가 { name, description, price, is_active }
//   PATCH  → 상품 수정 { id, ...바꿀 값 }
//   DELETE → 상품 삭제 ?id=
// 상품을 올리는 것 자체는 요금제와 상관없이 미리 해 둘 수 있고, 손님에게 보이는 것은 '프리미엄 스토어' 이상일 때입니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  try {
    const [{ ready, products }, enabled] = await Promise.all([listProducts(ctx.placeId, false), storeEnabled(ctx.placeId)]);
    return NextResponse.json({ ready, enabled, products });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "불러오지 못했어요.", 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanProduct(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);

  const { count, error: countError } = await db.from("owner_products").select("*", { count: "exact", head: true }).eq("place_id", ctx.placeId);
  if (countError) return fail(isMissingSchema(countError) ? "상품 기능이 아직 준비되지 않았어요." : countError.message, isMissingSchema(countError) ? 503 : 500);
  if ((count ?? 0) >= PRODUCTS_PER_PLACE_MAX) return fail(`상품은 ${PRODUCTS_PER_PLACE_MAX}개까지 올릴 수 있어요.`, 400);

  const { data, error } = await db.from("owner_products")
    .insert([{ place_id: ctx.placeId, ...cleaned.product, sort_order: count ?? 0 }])
    .select("id, place_id, name, description, price, is_active, sort_order").single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ product: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("상품을 찾을 수 없어요.", 400);

  // 본인 가게의 상품인지 확인한 뒤, 지금 값 위에 바꿀 값만 덮어 다시 다듬습니다.
  const { data: current, error: findError } = await db.from("owner_products").select("name, description, price, is_active").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
  if (findError) return fail(findError.message, 500);
  if (!current) return fail("상품을 찾을 수 없어요.", 404);
  const cleaned = cleanProduct({ ...current, ...body });
  if ("error" in cleaned) return fail(cleaned.error, 400);

  const { data, error } = await db.from("owner_products")
    .update({ ...cleaned.product, updated_at: new Date().toISOString() }).eq("id", id).eq("place_id", ctx.placeId)
    .select("id, place_id, name, description, price, is_active, sort_order").single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ product: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("상품을 찾을 수 없어요.", 400);
  const { error } = await db.from("owner_products").delete().eq("id", id).eq("place_id", ctx.placeId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ success: true });
}
