import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, ownerContext, RESERVATION_COLUMNS } from "@/lib/server/ownerStore";
import { canChangeStatus, type ReservationStatus } from "@/lib/storeRules";

// 사장님의 예약 관리(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET   → 최근 예약 목록(손님 이름·전화 포함 — 그 가게의 사장님과 관리자만 볼 수 있음)
//           ?count=1 이면 확인을 기다리는 예약 수만(아래 탭바의 알림 숫자용)
//   PATCH → 상태 바꾸기 { id, status, ownerNote }  (확인 대기 → 확정/거절 → 준비 완료 → 수령 완료)

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
  const { data, error } = await db.from("place_reservations").select(RESERVATION_COLUMNS)
    .eq("place_id", ctx.placeId).order("created_at", { ascending: false }).limit(LIST_LIMIT);
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

  const { data: current, error: findError } = await db.from("place_reservations").select("status").eq("id", id).eq("place_id", ctx.placeId).maybeSingle();
  if (findError) return fail(findError.message, 500);
  if (!current) return fail("예약을 찾을 수 없어요.", 404);
  if (!canChangeStatus("owner", current.status as ReservationStatus, next)) return fail("지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로 고쳐 주세요.", 409);

  const ownerNote = typeof body?.ownerNote === "string" && body.ownerNote.trim() ? body.ownerNote.trim().slice(0, 200) : null;
  const { data, error } = await db.from("place_reservations")
    .update({ status: next, ...(ownerNote ? { owner_note: ownerNote } : {}), updated_at: new Date().toISOString() })
    // 그 사이 손님이 취소했을 수 있으니, 방금 확인한 상태일 때만 바꿉니다.
    .eq("id", id).eq("place_id", ctx.placeId).eq("status", current.status)
    .select(RESERVATION_COLUMNS).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("그 사이 예약 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  const { customer_auth_user_id: _hidden, ...rest } = data;
  return NextResponse.json({ reservation: rest });
}
