import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { refundStoreOrder } from "@/lib/server/storeOrders";

// 관리자 전용: 쇼핑 주문·환불·후기 신고
//   GET  → 결제한 주문(환불 실패 먼저)·가게 이름·신고된 후기·이용 완료 금액 합계(정산 참고용 — 수수료는 아직 정하지 않음)
//   POST { action: "retry_refund", id } / { action: "hide_review" | "keep_review", id }

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(300);
  if (error) return isMissingSchema(error) ? NextResponse.json({ orders: [], reports: [] }) : fail(error.message, 500);
  const rows = data ?? [];
  const placeIds = [...new Set(rows.map((r) => Number(r.place_id)))];
  const { data: places } = placeIds.length ? await db.from("places").select("id, name").in("id", placeIds) : { data: [] };
  const nameOf = new Map((places ?? []).map((p) => [Number(p.id), p.name as string]));
  const orders = rows.map(({ customer_auth_user_id: _hidden, ...r }) => ({ ...r, place_name: nameOf.get(Number(r.place_id)) ?? "가게" }))
    .sort((a, b) => Number(b.payment_status === "refund_failed") - Number(a.payment_status === "refund_failed"));
  const { data: reports } = await db.from("store_reviews").select("id, place_id, display_name, rating, content, report_reason, reported_at").not("reported_at", "is", null).eq("hidden", false).order("reported_at", { ascending: false }).limit(100);
  const settled = rows.filter((r) => r.payment_status === "paid" && (r.status === "completed" || r.status === "no_show")).reduce((sum, r) => sum + r.total, 0);
  return NextResponse.json({ orders, reports: reports ?? [], settled });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("대상을 찾을 수 없어요.", 400);
  if (body?.action === "retry_refund") {
    const { data: r } = await db.from("place_reservations").select("id, total, payment_status").eq("id", id).maybeSingle();
    if (!r || r.payment_status !== "refund_failed") return fail("환불을 다시 시도할 주문이 아니에요.", 409);
    await refundStoreOrder(r, "관리자 환불 재시도");
    const { data: after } = await db.from("place_reservations").select("payment_status").eq("id", id).maybeSingle();
    return after?.payment_status === "refunded" ? NextResponse.json({ ok: true }) : fail("이번에도 환불하지 못했어요. 결제사 화면을 확인해 주세요.", 502);
  }
  if (body?.action === "hide_review" || body?.action === "keep_review") {
    const { error } = await db.from("store_reviews").update(body.action === "hide_review" ? { hidden: true } : { reported_at: null, report_reason: null }).eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  return fail("요청이 올바르지 않아요.", 400);
}
