import { NextRequest, NextResponse } from "next/server";
import { db, ownerContext, storeOrderModes } from "@/lib/server/ownerStore";
import { cleanSearchTags } from "@/lib/talkSearch";
import { cleanOrderWeek, cleanStoreInfo, koreaDay, type OrderDay, type StoreInfo } from "@/lib/storeRules";

// 사장님이 직접 정하는 판매 설정(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET   → { tags, orderModes, orderOpen, orderClose, closedToday, storeInfo }
//   PATCH → { tags?, orderModes?, orderOpen?, orderClose? } 검색 해시태그(5개까지), 받는 방식(포장 pickup · 매장 식사 dine_in, 하나 이상),
//           포장 주문 가능 시간(HH:MM, 둘 다 비우면 제한 없음), closedToday(오늘 주문 마감. 날짜로 저장해 다음 날 자동으로 풀립니다)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const MODES = ["pickup", "dine_in"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { data, error } = await db.from("places").select("search_tags, order_open_time, order_close_time, orders_closed_on, store_info, order_week").eq("id", ctx.placeId).maybeSingle();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ tags: data?.search_tags ?? [], orderModes: await storeOrderModes(ctx.placeId), orderOpen: data?.order_open_time ?? "", orderClose: data?.order_close_time ?? "", closedToday: data?.orders_closed_on === koreaDay(Date.now()), storeInfo: cleanStoreInfo(data?.store_info), orderWeek: cleanOrderWeek(data?.order_week) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const update: { search_tags?: string[]; store_order_modes?: string[]; order_open_time?: string | null; order_close_time?: string | null; orders_closed_on?: string | null; store_info?: StoreInfo; order_week?: OrderDay[] | null } = {};
  if (body?.tags !== undefined) update.search_tags = cleanSearchTags(body.tags);
  if (body?.orderModes !== undefined) {
    const modes = Array.isArray(body.orderModes) ? MODES.filter((m) => body.orderModes.includes(m)) : [];
    if (modes.length === 0) return fail("포장 주문과 매장 식사 중 하나는 받아야 해요.", 400);
    update.store_order_modes = modes;
  }
  if (body?.orderOpen !== undefined || body?.orderClose !== undefined) {
    const open = typeof body.orderOpen === "string" ? body.orderOpen : "", close = typeof body.orderClose === "string" ? body.orderClose : "";
    if (open || close) {
      if (!TIME.test(open) || !TIME.test(close)) return fail("주문 시작과 마감 시간을 모두 골라 주세요.", 400);
      if (open === close) return fail("주문 시작과 마감 시간이 같아요.", 400);
    }
    update.order_open_time = open || null;
    update.order_close_time = close || null;
  }
  if (body?.orderWeek !== undefined) update.order_week = cleanOrderWeek(body.orderWeek);
  if (body?.storeInfo !== undefined) update.store_info = cleanStoreInfo(body.storeInfo);
  if (typeof body?.closedToday === "boolean") update.orders_closed_on = body.closedToday ? koreaDay(Date.now()) : null;
  if (Object.keys(update).length === 0) return fail("바꿀 내용이 없어요.", 400);
  const { error } = await db.from("places").update(update).eq("id", ctx.placeId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
