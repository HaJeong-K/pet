import { NextRequest, NextResponse } from "next/server";
import { koreaDay } from "@/lib/storeRules";
import { db, isMissingSchema, listProducts, storeEnabled, storeOrderModes, userOf, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";

// GET /api/store/{장소 번호}
// 장소 상세 화면의 "상품 · 예약 포장" 칸에 쓸 자료.
//   · enabled  : 이 가게가 주문을 받는지(쇼핑 입점 승인 또는 '프리미엄 스토어' 이상). false면 화면에 칸을 그리지 않습니다.
//   · orderModes : 받는 방식(포장 주문·매장 식사)
//   · products : 판매 중인 상품(꺼 둔 것은 빼고, 사장님이 정한 순서). 사진·분류·용량·재료·알레르기·원산지·주의사항·대표·품절 포함
//   · mine     : 로그인한 손님 본인이 이 가게에 넣은 최근 예약(다른 사람의 예약은 절대 내려주지 않음)
export async function GET(req: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const placeId = Number((await params).placeId);
  if (!Number.isInteger(placeId) || placeId <= 0) return NextResponse.json({ enabled: false, products: [], mine: [] });
  try {
    if (!(await storeEnabled(placeId))) return NextResponse.json({ enabled: false, products: [], mine: [] });
    const { ready, products } = await listProducts(placeId, true);
    if (!ready || products.length === 0) return NextResponse.json({ enabled: false, products: [], mine: [] });

    const { data: place } = await db.from("places").select("id, name, address, phone, category, lat, lng, hours, closed_days, parking, memo, order_open_time, order_close_time, orders_closed_on, store_info, order_week").eq("id", placeId).maybeSingle();
    const user = await userOf(req);
    let mine: unknown[] = [];
    let contact: { name: string; phone: string } | null = null;
    if (user) {
      // 주문자 이름·전화는 가입할 때 적은 정보를 그대로 씁니다
      const { data: saved } = await db.from("user_contacts").select("name, phone").eq("auth_user_id", user.id).maybeSingle();
      if (saved?.name && saved?.phone) contact = { name: saved.name, phone: saved.phone };
      const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS)
        .eq("place_id", placeId).eq("customer_auth_user_id", user.id).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(5);
      if (error && !isMissingSchema(error)) throw new Error(error.message);
      mine = (data ?? []).map(({ customer_auth_user_id: _hidden, ...rest }) => rest);
    }
    // 쓸 수 있는 쿠폰 — 이미 쓴 쿠폰은 뺍니다(취소·거절된 주문은 쓴 것으로 세지 않습니다)
    const { data: couponRows } = await db.from("store_coupons").select("id, name, discount, min_order, expires_on").eq("place_id", placeId).eq("is_active", true);
    const today = koreaDay(Date.now());
    let coupons = (couponRows ?? []).filter((c) => !c.expires_on || c.expires_on >= today);
    if (user && coupons.length) {
      const { data: used } = await db.from("place_reservations").select("coupon_id").eq("customer_auth_user_id", user.id).in("coupon_id", coupons.map((c) => c.id)).not("status", "in", "(cancelled,rejected)");
      const usedIds = new Set((used ?? []).map((u) => u.coupon_id));
      coupons = coupons.filter((c) => !usedIds.has(c.id));
    }
    return NextResponse.json({ enabled: true, place, contact, coupons, orderModes: await storeOrderModes(placeId), products: products.map(({ place_id: _place, is_active: _active, sort_order: _order, ...rest }) => rest), mine });
  } catch (e) {
    console.error("[/api/store] failed:", e);
    return NextResponse.json({ enabled: false, products: [], mine: [] });
  }
}
