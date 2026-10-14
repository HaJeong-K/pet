import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, listProducts, ownerContext, storeEnabled, PRODUCT_BASE_COLUMNS, PRODUCT_COLUMNS } from "@/lib/server/ownerStore";
import { cleanProduct, PRODUCTS_PER_PLACE_MAX, type ProductInput } from "@/lib/storeRules";
import { ownImageUrl } from "@/lib/server/ownerImage";

// 사장님의 상품 관리(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET    → 상품 목록(꺼 둔 것 포함) + 이 가게가 상품·예약 기능을 쓸 수 있는지(enabled)
//            + 자세한 칸(사진·재료·알레르기 등)을 쓸 수 있는지(detailReady — scripts/sql/owner-products-detail.sql 실행 여부)
//   POST   → 상품 추가 { name, price, description, category, imageUrl, unit, ingredients, allergy, origin, caution, is_featured, sold_out, is_active }
//   PATCH  → 상품 수정 { id, ...바꿀 값 }  또는 순서 바꾸기 { id, move: "up" | "down" }
//   DELETE → 상품 삭제 ?id=
// 상품을 올리는 것 자체는 요금제와 상관없이 미리 해 둘 수 있고, 손님에게 보이는 것은 '프리미엄 스토어' 이상일 때입니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEED_DETAIL_SQL = "사진·재료 같은 자세한 정보를 저장할 칸이 아직 없어요. Supabase SQL 편집기에서 scripts/sql/owner-products-detail.sql을 실행해 주세요.";

/** 화면에서 쓰는 이름(imageUrl) ↔ 표의 칸 이름(image_url) */
function toRow(product: ProductInput) {
  const { imageUrl, ...rest } = product;
  return { ...rest, image_url: imageUrl };
}
/** 자세한 칸을 하나도 안 쓴 상품인지(그렇다면 칸이 없어도 기본 칸만으로 저장할 수 있음) */
const usesDetail = (row: ReturnType<typeof toRow>) =>
  !!(row.category || row.image_url || row.unit || row.ingredients || row.allergy || row.origin || row.caution || row.is_featured || row.sold_out);
const baseOnly = (row: ReturnType<typeof toRow>) => ({ name: row.name, description: row.description, price: row.price, is_active: row.is_active });

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  try {
    const [{ ready, detailReady, products }, enabled] = await Promise.all([listProducts(ctx.placeId, false), storeEnabled(ctx.placeId)]);
    return NextResponse.json({ ready, detailReady, enabled, products });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "불러오지 못했어요.", 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanProduct(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  if (!ownImageUrl("product-images", ctx.placeId, cleaned.product.imageUrl)) return fail("사진을 다시 올려 주세요.", 400);
  const row = toRow(cleaned.product);

  const { data: existing, error: countError } = await db.from("owner_products").select("sort_order").eq("place_id", ctx.placeId);
  if (countError) return fail(isMissingSchema(countError) ? "상품 기능이 아직 준비되지 않았어요." : countError.message, isMissingSchema(countError) ? 503 : 500);
  if ((existing ?? []).length >= PRODUCTS_PER_PLACE_MAX) return fail(`상품은 ${PRODUCTS_PER_PLACE_MAX}개까지 올릴 수 있어요.`, 400);
  const sort_order = (existing ?? []).reduce((max, p) => Math.max(max, Number(p.sort_order) || 0), -1) + 1;

  let { data, error } = await db.from("owner_products").insert([{ place_id: ctx.placeId, ...row, sort_order }]).select(PRODUCT_COLUMNS).single();
  if (error && isMissingSchema(error)) {
    if (usesDetail(row)) return fail(NEED_DETAIL_SQL, 503);
    ({ data, error } = await db.from("owner_products").insert([{ place_id: ctx.placeId, ...baseOnly(row), sort_order }]).select(PRODUCT_BASE_COLUMNS).single() as never);
  }
  if (error) return fail(error.message, 500);
  return NextResponse.json({ product: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("상품을 찾을 수 없어요.", 400);

  // 순서 바꾸기 — 바로 위(아래) 상품과 자리를 맞바꿉니다.
  if (body?.move === "up" || body?.move === "down") {
    const { products } = await listProducts(ctx.placeId, false);
    const index = products.findIndex((p) => p.id === id);
    const other = index + (body.move === "up" ? -1 : 1);
    if (index < 0) return fail("상품을 찾을 수 없어요.", 404);
    if (other < 0 || other >= products.length) return NextResponse.json({ ok: true });
    const order = products.map((p) => p.id);
    [order[index], order[other]] = [order[other], order[index]];
    // 번호를 처음부터 다시 매깁니다(예전에 같은 번호가 섞여 있어도 한 번에 정리됨).
    const results = await Promise.all(order.map((productId, i) => db.from("owner_products").update({ sort_order: i }).eq("id", productId).eq("place_id", ctx.placeId)));
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(failed.error.message, 500);
    return NextResponse.json({ ok: true });
  }

  // 본인 가게의 상품인지 확인한 뒤, 지금 값 위에 바꿀 값만 덮어 다시 다듬습니다.
  const { products } = await listProducts(ctx.placeId, false);
  const current = products.find((p) => p.id === id);
  if (!current) return fail("상품을 찾을 수 없어요.", 404);
  const cleaned = cleanProduct({ ...current, imageUrl: current.image_url, ...body });
  if ("error" in cleaned) return fail(cleaned.error, 400);
  if (!ownImageUrl("product-images", ctx.placeId, cleaned.product.imageUrl)) return fail("사진을 다시 올려 주세요.", 400);
  const row = toRow(cleaned.product);

  let { data, error } = await db.from("owner_products").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("place_id", ctx.placeId).select(PRODUCT_COLUMNS).single();
  if (error && isMissingSchema(error)) {
    if (usesDetail(row)) return fail(NEED_DETAIL_SQL, 503);
    ({ data, error } = await db.from("owner_products").update({ ...baseOnly(row), updated_at: new Date().toISOString() }).eq("id", id).eq("place_id", ctx.placeId).select(PRODUCT_BASE_COLUMNS).single() as never);
  }
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
