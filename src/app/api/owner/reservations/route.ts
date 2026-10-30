import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, ownerContext, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { notifyOrderCustomer, refundStoreOrder, runStoreOrderChores } from "@/lib/server/storeOrders";
import { canChangeStatus, type ReservationStatus } from "@/lib/storeRules";

// 사장님의 예약 관리(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET   → 최근 예약 목록(손님 이름·전화 포함 — 그 가게의 사장님과 관리자만 볼 수 있음)
//           ?count=1 이면 확인을 기다리는 예약 수만(아래 탭바의 알림 숫자용)
//           결제를 마치지 않은 주문은 보이지 않습니다.
//   PATCH → 상태 바꾸기 { id, status, ownerNote }  (확인 대기 → 확정/거절 → 준비 완료 → 이용 완료·노쇼)
//           거절·가게 취소는 전액 환불, 노쇼는 환불 없음.
//           취소 요청 답하기 { id, cancelAnswer: "approve" | "deny", ownerNote } — 받아 주면 전액 환불

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const LIST_LIMIT = 200;

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (req.nextUrl.searchParams.get("count")) {
    const { count, error } = await db.from("place_reservations").select("id", { count: "exact", head: true }).eq("place_id", ctx.placeId).eq("status", "requested");
    // 표가 아직 없거나 세지 못하면 0으로(알림 숫자가 화면을 막으면 안 됩니다)
    return NextResponse.json({ waiting: error ? 0 : count ?? 0 });
  }
  await runStoreOrderChores(ctx.placeId).catch(() => null);
  const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS)
    .eq("place_id", ctx.placeId).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ready: false, reservations: [] });
    return fail(error.message, 500);
  }
  // 손님의 계정 번호는 화면에 필요 없어서 빼고 보냅니다.
  return NextResponse.json({ ready: true, reservations: (data ?? []).map(({ customer_auth_user_id: _hidden, ...rest }) => rest) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const next = body?.status as ReservationStatus;
  if (!Number.isInteger(id) || id <= 0) return fail("예약을 찾을 수 없어요.", 400);

  const { data: current, error: findError } = await db.from("place_reservations").select("status, total, payment_status, cancel_request_status, customer_auth_user_id").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
  if (findError) return fail(findError.message, 500);
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  const tellCustomer = (title: string, text: string) => after(() => notifyOrderCustomer(current.customer_auth_user_id, ctx.placeId, title, text));

  if (body?.cancelAnswer === "approve" || body?.cancelAnswer === "deny") {
    if (current.cancel_request_status !== "open") return fail("답할 취소 요청이 없어요. 화면을 새로 고쳐 주세요.", 409);
    const approve = body.cancelAnswer === "approve";
    const answer = typeof body?.ownerNote === "string" ? body.ownerNote.trim().slice(0, 200) : "";
    if (!approve && !answer) return fail("받지 못하는 이유를 적어 주세요.", 400);
    const { data, error } = await db.from("place_reservations")
      .update({ cancel_request_status: approve ? "approved" : "denied", cancel_request_answer: answer || null, ...(approve ? { status: "cancelled" } : {}), updated_at: new Date().toISOString() })
      .eq("id", id).eq("place_id", ctx.placeId).eq("cancel_request_status", "open").select(RESERVATION_COLUMNS).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail("그 사이 주문 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
    if (approve) await refundStoreOrder({ id, total: current.total, payment_status: current.payment_status }, "손님 취소 요청 승인");
    tellCustomer(approve ? "취소 요청을 받아 줬어요" : "가게가 취소 요청을 받지 못했어요", approve ? "전액 환불해요." : answer);
    const { customer_auth_user_id: _hidden, ...rest } = data;
    return NextResponse.json({ reservation: rest });
  }
  if (!canChangeStatus("owner", current.status as ReservationStatus, next)) return fail("지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로 고쳐 주세요.", 409);

  const ownerNote = typeof body?.ownerNote === "string" && body.ownerNote.trim() ? body.ownerNote.trim().slice(0, 200) : null;
  const { data, error } = await db.from("place_reservations")
    .update({ status: next, ...(ownerNote ? { owner_note: ownerNote } : {}), updated_at: new Date().toISOString() })
    // 그 사이 손님이 취소했을 수 있으니, 방금 확인한 상태일 때만 바꿉니다.
    .eq("id", id).eq("place_id", ctx.placeId).eq("status", current.status)
    .select(RESERVATION_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  if (next === "rejected" || next === "cancelled") await refundStoreOrder({ id, total: current.total, payment_status: current.payment_status }, next === "rejected" ? "가게 거절" : "가게 취소");
  const notice: Partial<Record<ReservationStatus, [string, string]>> = {
    accepted: ["주문이 확정됐어요", "가게에서 준비를 시작해요."],
    ready: ["주문이 준비됐어요", "시간에 맞춰 방문해 주세요."],
    rejected: ["가게가 주문을 받지 못했어요", ownerNote ?? "전액 환불해요."],
    cancelled: ["가게 사정으로 주문이 취소됐어요", ownerNote ?? "전액 환불해요."],
    completed: ["이용은 어떠셨나요?", "주문·예약 내역에서 후기를 남겨 주세요."],
  };
  const n = notice[next];
  if (n) tellCustomer(n[0], n[1]);
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest });
}
