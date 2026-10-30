import { NextRequest, NextResponse } from "next/server";
import { userOf } from "@/lib/server/ownerStore";
import { paymentsEnabled, preparePayment } from "@/lib/server/payments";

// 결제창을 열기 전 — { kind: "lodging" | "store", id } → { orderId, amount, orderName }
// 금액은 손님이 보낸 값이 아니라 예약·주문에 적힌 금액입니다.
export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!paymentsEnabled()) return NextResponse.json({ error: "카드 결제를 준비하고 있어요." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if ((body?.kind !== "lodging" && body?.kind !== "store") || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "결제할 내역을 찾을 수 없어요." }, { status: 400 });
  const result = await preparePayment(body.kind, id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
