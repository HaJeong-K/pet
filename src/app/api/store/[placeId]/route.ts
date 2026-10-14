import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, listProducts, storeEnabled, userOf, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";

// GET /api/store/{장소 번호}
// 장소 상세 화면의 "상품 · 예약 포장" 칸에 쓸 자료.
//   · enabled  : 이 가게가 상품·예약 기능을 쓰는 중인지('프리미엄 스토어' 이상). false면 화면에 칸을 그리지 않습니다.
//   · products : 판매 중인 상품(꺼 둔 것은 빼고, 사장님이 정한 순서). 사진·분류·용량·재료·알레르기·원산지·주의사항·대표·품절 포함
//   · mine     : 로그인한 손님 본인이 이 가게에 넣은 최근 예약(다른 사람의 예약은 절대 내려주지 않음)
export async function GET(req: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const placeId = Number((await params).placeId);
  if (!Number.isInteger(placeId) || placeId <= 0) return NextResponse.json({ enabled: false, products: [], mine: [] });
  try {
    if (!(await storeEnabled(placeId))) return NextResponse.json({ enabled: false, products: [], mine: [] });
    const { ready, products } = await listProducts(placeId, true);
    if (!ready || products.length === 0) return NextResponse.json({ enabled: false, products: [], mine: [] });

    const user = await userOf(req);
    let mine: unknown[] = [];
    if (user) {
      const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS)
        .eq("place_id", placeId).eq("customer_auth_user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (error && !isMissingSchema(error)) throw new Error(error.message);
      mine = (data ?? []).map(({ customer_auth_user_id: _hidden, ...rest }) => rest);
    }
    return NextResponse.json({ enabled: true, products: products.map(({ place_id: _place, is_active: _active, sort_order: _order, ...rest }) => rest), mine });
  } catch (e) {
    console.error("[/api/store] failed:", e);
    return NextResponse.json({ enabled: false, products: [], mine: [] });
  }
}
