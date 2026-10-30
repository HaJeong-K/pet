import { beforeEach, describe, expect, it, vi } from "vitest";

// 표마다 가짜 행을 두고, 체이닝 호출은 그대로 넘기다가 결과만 돌려주는 가짜 DB
const rows: Record<string, Record<string, unknown> | null> = {};
const updates: { table: string; values: Record<string, unknown> }[] = [];
function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "neq", "lt", "limit", "order"]) c[m] = () => c;
  c.update = (values: Record<string, unknown>) => { updates.push({ table, values }); return c; };
  c.insert = () => Promise.resolve({ error: null });
  c.maybeSingle = () => Promise.resolve({ data: rows[table] ?? null, error: null });
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return c;
}
vi.mock("@/lib/server/ownerStore", () => ({ db: { from: (t: string) => chain(t) } }));
vi.mock("@/lib/server/notify", () => ({ notifyAdmin: vi.fn(async () => {}) }));

import { confirmPayment, refundPayment } from "./payments";

const fetchMock = vi.fn();
const tossOk = { paymentKey: "pk", orderId: "o", status: "DONE", method: "카드", totalAmount: 15000, balanceAmount: 15000, receipt: { url: "https://r" } };
const ok = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = "test_secret";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  updates.length = 0;
  rows.payments = { id: 1, kind: "store", ref_id: 7, amount: 15000, status: "ready", auth_user_id: "u1", order_name: "가게", payment_key: "pk", refunded_amount: 0 };
  rows.place_reservations = { id: 7, status: "pending_payment", total: 15000, customer_auth_user_id: "u1", place_id: 3, order_type: "pickup" };
  rows.places = { name: "가게" };
});

const input = { paymentKey: "pk", orderId: "o", amount: 15000 };

describe("결제 승인", () => {
  it("금액이 주문과 다르면 토스에 승인을 요청하지 않는다", async () => {
    const r = await confirmPayment({ ...input, amount: 100 }, "u1", async () => true);
    expect("error" in r).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("다른 사람의 결제는 승인하지 않는다", async () => {
    const r = await confirmPayment(input, "u2", async () => true);
    expect(r).toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("이미 시간이 지난 주문은 승인하지 않는다", async () => {
    rows.place_reservations = { ...rows.place_reservations, status: "requested" };
    const r = await confirmPayment(input, "u1", async () => true);
    expect(r).toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("이미 결제한 건을 다시 승인해도 토스를 또 부르지 않는다", async () => {
    rows.payments = { ...rows.payments!, status: "paid" };
    expect(await confirmPayment(input, "u1", async () => true)).toEqual({ kind: "store", refId: 7 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("성공하면 시크릿 키로 승인하고 결제 수단·영수증을 적는다", async () => {
    fetchMock.mockResolvedValueOnce(ok(tossOk));
    const onPaid = vi.fn(async () => true);
    expect(await confirmPayment(input, "u1", onPaid)).toEqual({ kind: "store", refId: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("test_secret:").toString("base64")}`);
    expect(onPaid).toHaveBeenCalledOnce();
    expect(updates.find((u) => u.table === "payments")?.values).toMatchObject({ status: "paid", method: "카드", receipt_url: "https://r" });
  });
  it("토스가 거절하면 예약을 확정하지 않는다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: "REJECT_CARD_PAYMENT", message: "한도 초과" }) });
    const onPaid = vi.fn(async () => true);
    expect(await confirmPayment(input, "u1", onPaid)).toMatchObject({ status: 402, error: "한도 초과" });
    expect(onPaid).not.toHaveBeenCalled();
  });
  it("승인 사이에 주문이 사라졌으면 곧바로 환불한다", async () => {
    fetchMock.mockResolvedValueOnce(ok(tossOk)).mockResolvedValueOnce(ok(tossOk));
    const r = await confirmPayment(input, "u1", async () => false);
    expect(r).toMatchObject({ status: 409 });
    expect(fetchMock.mock.calls[1][0]).toContain("/pk/cancel");
  });
});

describe("환불", () => {
  it("전액 환불은 금액 없이, 일부 환불은 금액을 넣어 보낸다", async () => {
    fetchMock.mockResolvedValue(ok(tossOk));
    expect(await refundPayment("store", 7, 15000, "취소")).toBe("done");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cancelReason: "취소" });
    expect(await refundPayment("store", 7, 5000, "일부")).toBe("done");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ cancelReason: "일부", cancelAmount: 5000 });
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBeTruthy();
  });
  it("토스로 결제한 적이 없으면 아무것도 하지 않는다", async () => {
    rows.payments = null;
    expect(await refundPayment("store", 7, 15000, "취소")).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("환불이 실패하면 failed를 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: "X", message: "실패" }) });
    expect(await refundPayment("store", 7, 15000, "취소")).toBe("failed");
  });
});
