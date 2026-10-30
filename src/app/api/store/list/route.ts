import { NextResponse } from "next/server";
import { db, isMissingSchema, PRODUCT_BASE_COLUMNS, PRODUCT_COLUMNS, type ProductRow } from "@/lib/server/ownerStore";
import { normalizePlan, planAtLeast } from "@/lib/ownerPlans";

// GET /api/store/list
// 쇼핑 탭(/shop)에 보여 줄 가게와 상품 — 쇼핑 입점 승인 또는 '프리미엄 스토어' 이상이고 판매 중인 상품이 하나라도 있는 가게 전부.
// 가까운 순 정렬은 화면에서 합니다(이 응답은 누구에게나 같아서 CDN이 잠깐 대신 응답할 수 있게).
// 예약은 가게별 화면(/api/store/{가게 번호} · /api/store/reserve)에서 합니다.

export const revalidate = 60;

export async function GET() {
  const headers = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
  try {
    const { data: places, error } = await db.from("places")
      .select("id, name, address, category, image_url, lat, lng, premium_plan")
      .eq("is_premium", true).gt("premium_expires_at", new Date().toISOString()).limit(1000);
    // 요금제 단계 칸이 아직 없으면 스토어 가게도 없습니다.
    if (error) return NextResponse.json({ stores: [] }, { headers: isMissingSchema(error) ? headers : undefined });
    // 입점 승인된 가게(표가 없으면 빈 목록)
    const { data: partners } = await db.from("store_partners").select("linked_place_id, order_modes").eq("status", "approved").not("linked_place_id", "is", null).limit(1000);
    const modesOf = new Map((partners ?? []).map((p) => [Number(p.linked_place_id), p.order_modes as string[]]));
    const planPlaces = (places ?? []).filter((p) => planAtLeast(normalizePlan(p.premium_plan), "store"));
    const planIds = new Set(planPlaces.map((p) => Number(p.id)));
    const extraIds = [...modesOf.keys()].filter((id) => !planIds.has(id));
    const { data: partnerPlaces } = extraIds.length
      ? await db.from("places").select("id, name, address, category, image_url, lat, lng, premium_plan").in("id", extraIds)
      : { data: [] };
    const storePlaces = [...planPlaces, ...(partnerPlaces ?? [])];
    if (storePlaces.length === 0) return NextResponse.json({ stores: [] }, { headers });

    const ids = storePlaces.map((p) => p.id);
    const run = (columns: string) => db.from("owner_products").select(columns).in("place_id", ids).eq("is_active", true).order("sort_order").order("id");
    let { data: products, error: productError } = await run(PRODUCT_COLUMNS);
    if (productError && isMissingSchema(productError)) ({ data: products, error: productError } = await run(PRODUCT_BASE_COLUMNS));
    if (productError) return NextResponse.json({ stores: [] });

    const byPlace = new Map<number, ProductRow[]>();
    for (const product of (products ?? []) as unknown as ProductRow[]) {
      const list = byPlace.get(Number(product.place_id));
      if (list) list.push(product); else byPlace.set(Number(product.place_id), [product]);
    }
    const stores = storePlaces
      .filter((p) => byPlace.has(Number(p.id)))
      .map((p) => {
        const list = byPlace.get(Number(p.id))!;
        // 대표 상품을 앞에 두고, 미리보기로 몇 개만 내려보냅니다(전체는 가게를 펼칠 때 따로 받음).
        const sorted = [...list].sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured));
        return {
          id: Number(p.id), name: p.name, address: p.address, category: p.category, image: p.image_url,
          lat: p.lat != null ? Number(p.lat) : null, lng: p.lng != null ? Number(p.lng) : null,
          productCount: list.length,
          orderModes: modesOf.get(Number(p.id)) ?? ["pickup"],
          categories: [...new Set(list.map((x) => x.category).filter(Boolean))],
          preview: sorted.slice(0, 6).map((x) => ({ id: x.id, name: x.name, price: x.price, image: x.image_url ?? null, soldOut: !!x.sold_out, featured: !!x.is_featured })),
        };
      });
    return NextResponse.json({ stores }, { headers });
  } catch (e) {
    console.error("[/api/store/list] failed:", e);
    return NextResponse.json({ stores: [] });
  }
}
