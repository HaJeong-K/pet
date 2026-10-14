// src/lib/storeRules.ts
//
// "상품 등록 · 예약 포장"의 규칙 — 입력값 다듬기, 예약 상태가 어떻게 바뀔 수 있는지.
// 화면(브라우저)과 서버가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다(테스트하기 쉽게).
//
// 결제는 받지 않습니다 — 손님은 예약만 하고 가게에서 결제합니다(결제대행 연동 전 단계).

export const PRODUCT_NAME_MAX = 40;
export const PRODUCT_DESC_MAX = 200;
export const PRODUCT_PRICE_MAX = 5_000_000;
/** 가게 한 곳이 올릴 수 있는 상품 수 */
export const PRODUCTS_PER_PLACE_MAX = 60;
/** 예약 한 건에 담을 수 있는 상품 가짓수 / 상품 하나의 수량 */
export const RESERVATION_LINES_MAX = 20;
export const RESERVATION_QTY_MAX = 30;
/** 며칠 뒤까지 예약할 수 있는지 */
export const PICKUP_MAX_DAYS = 14;

export type ProductInput = { name: string; description: string | null; price: number; is_active: boolean };

/** 상품 입력값을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanProduct(raw: unknown): { product: ProductInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "상품 이름을 적어 주세요." };
  if (name.length > PRODUCT_NAME_MAX) return { error: `상품 이름은 ${PRODUCT_NAME_MAX}자까지예요.` };
  const price = Number(r.price);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) return { error: "가격은 0 이상의 숫자로 적어 주세요." };
  if (price > PRODUCT_PRICE_MAX) return { error: "가격이 너무 커요. 다시 확인해 주세요." };
  const description = typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, PRODUCT_DESC_MAX) : null;
  return { product: { name, description, price, is_active: r.is_active !== false } };
}

export type ReservationStatus = "requested" | "accepted" | "ready" | "completed" | "rejected" | "cancelled";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  requested: "확인 대기",
  accepted: "예약 확정",
  ready: "준비 완료",
  completed: "수령 완료",
  rejected: "거절됨",
  cancelled: "취소됨",
};

/** 사장님이 바꿀 수 있는 다음 상태 */
const OWNER_NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  requested: ["accepted", "rejected"],
  accepted: ["ready", "completed", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};
/** 손님이 바꿀 수 있는 다음 상태 — 가게가 준비를 마치기 전까지만 취소할 수 있습니다 */
const CUSTOMER_NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  requested: ["cancelled"],
  accepted: ["cancelled"],
  ready: [],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canChangeStatus(by: "owner" | "customer", from: ReservationStatus, to: ReservationStatus): boolean {
  return (by === "owner" ? OWNER_NEXT : CUSTOMER_NEXT)[from]?.includes(to) ?? false;
}
export const ownerNextStatuses = (from: ReservationStatus): ReservationStatus[] => OWNER_NEXT[from] ?? [];
/** 아직 끝나지 않은 예약인지(사장님이 챙겨야 하는 것) */
export const isOpenStatus = (status: ReservationStatus) => status === "requested" || status === "accepted" || status === "ready";

export type ReservationLine = { productId: number; name: string; price: number; qty: number };

/**
 * 손님이 고른 것(상품 번호·수량)을 가게의 실제 상품과 맞춰 예약 내역을 만듭니다.
 * 이름과 가격은 손님이 보낸 값이 아니라 가게가 올린 값으로 다시 채웁니다(가격을 바꿔 보내도 소용없게).
 */
export function buildReservationLines(
  picked: unknown,
  products: { id: number; name: string; price: number; is_active: boolean }[],
): { lines: ReservationLine[]; total: number } | { error: string } {
  if (!Array.isArray(picked) || picked.length === 0) return { error: "예약할 상품을 골라 주세요." };
  if (picked.length > RESERVATION_LINES_MAX) return { error: `한 번에 ${RESERVATION_LINES_MAX}가지까지 예약할 수 있어요.` };
  const byId = new Map(products.map((p) => [p.id, p]));
  const merged = new Map<number, number>();
  for (const item of picked) {
    const productId = Number((item as Record<string, unknown>)?.productId);
    const qty = Number((item as Record<string, unknown>)?.qty);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty <= 0) return { error: "수량을 다시 확인해 주세요." };
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  const lines: ReservationLine[] = [];
  for (const [productId, qty] of merged) {
    const product = byId.get(productId);
    if (!product || !product.is_active) return { error: "지금은 예약할 수 없는 상품이 들어 있어요. 화면을 새로 고쳐 주세요." };
    if (qty > RESERVATION_QTY_MAX) return { error: `상품 하나는 ${RESERVATION_QTY_MAX}개까지 예약할 수 있어요.` };
    lines.push({ productId, name: product.name, price: product.price, qty });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.price * line.qty, 0) };
}

/** 예약자 정보(이름·전화·가지러 갈 시각·메모)를 다듬습니다. */
export function cleanReservationContact(raw: unknown, now = Date.now()): { name: string; phone: string; pickupAt: string | null; memo: string | null } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 20) : "";
  if (!name) return { error: "예약자 이름을 적어 주세요." };
  const digits = typeof r.phone === "string" ? r.phone.replace(/\D/g, "") : "";
  if (digits.length < 9 || digits.length > 11) return { error: "연락받을 전화번호를 확인해 주세요." };
  let pickupAt: string | null = null;
  if (typeof r.pickupAt === "string" && r.pickupAt) {
    const at = new Date(r.pickupAt).getTime();
    if (Number.isNaN(at)) return { error: "가지러 갈 시간을 다시 골라 주세요." };
    if (at < now - 5 * 60_000) return { error: "가지러 갈 시간이 이미 지났어요." };
    if (at > now + PICKUP_MAX_DAYS * 86_400_000) return { error: `${PICKUP_MAX_DAYS}일 안의 시간으로 골라 주세요.` };
    pickupAt = new Date(at).toISOString();
  }
  const memo = typeof r.memo === "string" && r.memo.trim() ? r.memo.trim().slice(0, 200) : null;
  return { name, phone: digits, pickupAt, memo };
}
