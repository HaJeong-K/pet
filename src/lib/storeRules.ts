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
