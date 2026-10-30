// src/lib/storeRules.ts
//
// "상품 등록 · 포장 주문 · 매장 식사 예약"의 규칙 — 입력값 다듬기, 예약 상태가 어떻게 바뀔 수 있는지.
// 화면(브라우저)과 서버가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다(테스트하기 쉽게).
//
// 선결제 방식입니다 — 손님이 주문할 때 미리 결제합니다(src/lib/server/payments.ts). 결제 키를 넣기 전에는 주문만 접수되고 payment_status = 'unpaid'로 남습니다.
// 취소: 가게가 확정하기 전에는 바로 취소·전액 환불, 거절도 전액 환불. 확정 뒤에는 손님이 취소 요청을 보내고 사장님이 받아 주면 전액 환불. 노쇼는 환불 없이 가게에 정산.

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

/** 자세한 정보 칸(모두 선택)의 글자 수 한도 */
export const PRODUCT_CATEGORY_MAX = 20;
export const PRODUCT_UNIT_MAX = 40;
export const PRODUCT_DETAIL_MAX = 300;
/** 분류를 고를 때 보여 주는 예시 — 직접 적어도 됩니다 */
export const PRODUCT_CATEGORY_SUGGESTIONS = ["수제 간식", "사료·영양제", "케이크·특식", "장난감", "의류·액세서리", "산책 용품", "위생·미용 용품", "미용·서비스"];

export type ProductInput = {
  name: string; description: string | null; price: number; is_active: boolean;
  // ── 아래는 모두 선택 — 장난감처럼 해당 없는 상품은 비워 둡니다 ──
  /** 분류(손님 화면에서 묶어 보여 줌) */
  category: string | null;
  /** 상품 사진 주소 */
  imageUrl: string | null;
  /** 용량·크기·구성(예: 100g, S·M·L, 3개입) */
  unit: string | null;
  /** 재료(먹는 것)·소재(용품) */
  ingredients: string | null;
  /** 알레르기 정보 */
  allergy: string | null;
  /** 원산지·제조 */
  origin: string | null;
  /** 주의사항·보관 방법·급여 대상 */
  caution: string | null;
  /** 대표 상품 */
  is_featured: boolean;
  /** 품절 — 손님에게 보이지만 예약은 받지 않음 */
  sold_out: boolean;
};

/** 상품 입력값을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanProduct(raw: unknown): { product: ProductInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "상품 이름을 적어 주세요." };
  if (name.length > PRODUCT_NAME_MAX) return { error: `상품 이름은 ${PRODUCT_NAME_MAX}자까지예요.` };
  const price = Number(r.price);
  if (r.price === "" || r.price == null || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)) return { error: "가격은 0 이상의 숫자로 적어 주세요." };
  if (price > PRODUCT_PRICE_MAX) return { error: "가격이 너무 커요. 다시 확인해 주세요." };
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  // 사진 주소는 화면에서는 imageUrl, 표에서는 image_url — 둘 다 받습니다.
  const imageUrl = text(r.imageUrl ?? r.image_url, 500);
  if (imageUrl && !/^https:\/\/[^\s"'<>]+$/.test(imageUrl)) return { error: "사진 주소가 올바르지 않아요. 사진을 다시 올려 주세요." };
  return {
    product: {
      name, price,
      description: text(r.description, PRODUCT_DESC_MAX),
      is_active: r.is_active !== false,
      category: text(r.category, PRODUCT_CATEGORY_MAX),
      imageUrl,
      unit: text(r.unit, PRODUCT_UNIT_MAX),
      ingredients: text(r.ingredients, PRODUCT_DETAIL_MAX),
      allergy: text(r.allergy, PRODUCT_DETAIL_MAX),
      origin: text(r.origin, PRODUCT_DETAIL_MAX),
      caution: text(r.caution, PRODUCT_DETAIL_MAX),
      is_featured: r.is_featured === true,
      sold_out: r.sold_out === true,
    },
  };
}

/**
 * 손님 화면에 보여 줄 순서 — 대표 상품 먼저, 그다음 분류별로 묶어서(분류 없는 것은 "기타"로 맨 뒤). 같은 묶음 안에서는 사장님이 정한 순서.
 */
export function groupProducts<T extends { category?: string | null; is_featured?: boolean | null }>(products: T[]): { title: string; items: T[] }[] {
  const groups: { title: string; items: T[] }[] = [];
  const featured = products.filter((p) => p.is_featured);
  if (featured.length > 0) groups.push({ title: "대표 상품", items: featured });
  const rest = products.filter((p) => !p.is_featured);
  const titles = [...new Set(rest.map((p) => p.category || ""))].sort((a, b) => Number(a === "") - Number(b === ""));
  for (const title of titles) groups.push({ title: title || (groups.length > 0 || titles.length > 1 ? "기타" : "상품"), items: rest.filter((p) => (p.category || "") === title) });
  return groups;
}

export type ReservationStatus = "pending_payment" | "requested" | "accepted" | "ready" | "completed" | "rejected" | "cancelled" | "no_show";

/** 주문 방식 — 포장 / 매장 식사 */
export type OrderType = "pickup" | "dine_in";
export const ORDER_TYPE_LABEL: Record<OrderType, string> = { pickup: "포장 주문", dine_in: "매장 식사 예약" };
export const PARTY_SIZE_MAX = 30;
/** 가게가 확인하지 않으면 자동 취소·전액 환불되는 시간 */
export const STORE_CONFIRM_LIMIT_MS = 12 * 3_600_000;
/** 약속 시간에서 이만큼 지나면 자동 이용 완료 */
export const STORE_AUTO_COMPLETE_MS = 24 * 3_600_000;
/** 이용 완료 뒤 후기를 쓸 수 있는 기간 */
export const STORE_REVIEW_DAYS = 30;
export const PAYMENT_STATUS_LABEL: Record<string, string> = { paid: "결제 완료", refunded: "환불 완료", refund_failed: "환불 처리 중" };

/** 확정 뒤에 취소 요청을 보낼 수 있는지 */
export function canRequestCancel(status: ReservationStatus, requestStatus: string | null | undefined): boolean {
  return (status === "accepted" || status === "ready") && (requestStatus ?? "none") === "none";
}
/** 후기를 쓸 수 있는지 — 이용 완료 후 30일 안 */
export function canReviewOrder(status: ReservationStatus, finishedAt: string, now: number): boolean {
  return status === "completed" && now - new Date(finishedAt).getTime() <= STORE_REVIEW_DAYS * 86_400_000;
}
/** 손님의 후기를 다듬습니다 */
export function cleanStoreReview(raw: unknown): { reservationId: number; rating: number; content: string } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const reservationId = Number(r.reservationId);
  const rating = Number(r.rating);
  const content = typeof r.content === "string" ? r.content.trim() : "";
  if (!Number.isInteger(reservationId) || reservationId <= 0) return { error: "후기를 남길 주문을 찾을 수 없어요." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "별점을 골라 주세요." };
  if (content.length < 10) return { error: "후기는 10자 이상 적어 주세요." };
  return { reservationId, rating, content: content.slice(0, 1000) };
}

/** 사장님이 고른 받을 방식을 다듬습니다 */
export function cleanOrderModes(raw: unknown): OrderType[] {
  if (!Array.isArray(raw)) return [];
  return (["pickup", "dine_in"] as OrderType[]).filter((m) => raw.includes(m));
}

/** 손님 주문의 방식·인원을 다듬습니다. 매장 식사는 인원과 방문 시간이 꼭 있어야 합니다. */
export function cleanOrderOptions(raw: unknown, allowed: OrderType[], pickupAt: string | null): { orderType: OrderType; partySize: number | null } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const orderType: OrderType = r.orderType === "dine_in" ? "dine_in" : "pickup";
  if (!allowed.includes(orderType)) return { error: `이 가게는 ${ORDER_TYPE_LABEL[orderType]}을 받지 않아요.` };
  if (orderType === "pickup") return { orderType, partySize: null };
  const partySize = Number(r.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > PARTY_SIZE_MAX) return { error: "방문 인원을 확인해 주세요." };
  if (!pickupAt) return { error: "방문 시간을 골라 주세요." };
  return { orderType, partySize };
}

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending_payment: "결제 대기",
  requested: "확인 대기",
  accepted: "예약 확정",
  ready: "준비 완료",
  completed: "수령 완료",
  rejected: "거절됨",
  cancelled: "취소됨",
  no_show: "노쇼",
};

/** 사장님이 바꿀 수 있는 다음 상태 */
const OWNER_NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  pending_payment: [],
  requested: ["accepted", "rejected"],
  accepted: ["ready", "completed", "no_show", "cancelled"],
  ready: ["completed", "no_show", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
  no_show: [],
};
/** 손님이 바꿀 수 있는 다음 상태 — 선결제라 가게가 확정(준비 시작)하기 전까지만 취소할 수 있습니다 */
const CUSTOMER_NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  pending_payment: [],
  requested: ["cancelled"],
  accepted: [],
  ready: [],
  completed: [],
  rejected: [],
  cancelled: [],
  no_show: [],
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
  products: { id: number; name: string; price: number; is_active: boolean; sold_out?: boolean | null }[],
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
    if (product.sold_out) return { error: `"${product.name}"은(는) 품절이에요. 빼고 다시 예약해 주세요.` };
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
