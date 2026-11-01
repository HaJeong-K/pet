import { describe, it, expect } from "vitest";
import { cleanCoupon, cleanOrderWeek, cleanReviewPhotos, couponProblem, orderHoursToday, cleanProductOptions, cleanStoreInfo, isWithinOrderHours, buildReservationLines, canChangeStatus, canRequestCancel, canReviewOrder, cleanOrderModes, cleanOrderOptions, cleanStoreReview, cleanProduct, groupProducts, cleanReservationContact, isOpenStatus, ownerNextStatuses, PICKUP_MAX_DAYS, RESERVATION_QTY_MAX } from "./storeRules";
import { normalizePlan, planAtLeast, PLAN_MONTHLY_PRICE, quote } from "./ownerPlans";
import { BANNER_ROTATE_MS, bannerRegionOf, bannerSource, isInSigungu, pickLocalAds, rotateByTime, type AdPlace, type BannerPerk } from "./localAds";
import { adjustExpiry } from "./premiumPeriod";

describe("상품 입력값", () => {
  it("이름 앞뒤 공백을 다듬고 그대로 받는다", () => {
    expect(cleanProduct({ name: "  수제  육포 ", price: 5000 })).toEqual({ product: {
      name: "수제 육포", description: null, price: 5000, is_active: true,
      category: null, imageUrl: null, unit: null, ingredients: null, allergy: null, origin: null, caution: null, allergens: [], options: [], feed_reg_no: null, is_featured: false, sold_out: false,
    } });
  });
  it("자세한 정보는 모두 선택 — 적은 것만 남기고, 장난감처럼 비워 둬도 된다", () => {
    const food = cleanProduct({ name: "육포", price: 5000, category: " 수제 간식 ", unit: "100g", ingredients: "닭가슴살 100%", allergy: "닭고기", origin: "국내산", caution: "냉장 보관", is_featured: true, imageUrl: "https://x.test/a.jpg" });
    expect(food).toMatchObject({ product: { category: "수제 간식", unit: "100g", ingredients: "닭가슴살 100%", allergy: "닭고기", origin: "국내산", caution: "냉장 보관", is_featured: true, imageUrl: "https://x.test/a.jpg" } });
    const toy = cleanProduct({ name: "삑삑이 공", price: 3000, category: "장난감", ingredients: "  ", allergy: "" });
    expect(toy).toMatchObject({ product: { category: "장난감", ingredients: null, allergy: null, sold_out: false } });
  });
  it("가격을 비워 두거나 사진 주소가 이상하면 거절한다", () => {
    expect(cleanProduct({ name: "간식", price: "" })).toHaveProperty("error");
    expect(cleanProduct({ name: "간식", price: 1000, imageUrl: "javascript:alert(1)" })).toHaveProperty("error");
  });
  it("손님 화면에서는 대표 상품 먼저, 그다음 분류별로 묶는다(분류 없는 것은 맨 뒤 '기타')", () => {
    const groups = groupProducts([
      { id: 1, category: "장난감" }, { id: 2, category: null }, { id: 3, category: "수제 간식", is_featured: true }, { id: 4, category: "장난감" }, { id: 5, category: "수제 간식" },
    ]);
    expect(groups.map((g) => [g.title, g.items.map((p) => p.id)])).toEqual([["대표 상품", [3]], ["장난감", [1, 4]], ["수제 간식", [5]], ["기타", [2]]]);
    expect(groupProducts([{ id: 1, category: null }, { id: 2, category: null }]).map((g) => g.title)).toEqual(["상품"]);
  });
  it("이름이 없거나 가격이 이상하면 거절한다", () => {
    expect(cleanProduct({ name: " ", price: 1000 })).toHaveProperty("error");
    expect(cleanProduct({ name: "간식", price: -1 })).toHaveProperty("error");
    expect(cleanProduct({ name: "간식", price: 1000.5 })).toHaveProperty("error");
    expect(cleanProduct({ name: "간식", price: 99_999_999 })).toHaveProperty("error");
  });
});

describe("예약 상태가 바뀌는 순서", () => {
  it("사장님은 확인 대기 → 확정/거절 → 준비 완료 → 수령 완료로 넘긴다", () => {
    expect(ownerNextStatuses("requested")).toEqual(["accepted", "rejected"]);
    expect(canChangeStatus("owner", "accepted", "ready")).toBe(true);
    expect(canChangeStatus("owner", "ready", "completed")).toBe(true);
    expect(canChangeStatus("owner", "completed", "accepted")).toBe(false);
    expect(canChangeStatus("owner", "requested", "completed")).toBe(false);
  });
  it("손님은 가게가 준비를 마치기 전까지만 취소할 수 있다", () => {
    expect(canChangeStatus("customer", "requested", "cancelled")).toBe(true);
    expect(canChangeStatus("customer", "accepted", "cancelled")).toBe(false); // 선결제: 확정 뒤에는 취소 불가
    expect(canChangeStatus("owner", "ready", "no_show")).toBe(true);
    expect(cleanOrderOptions({ orderType: "dine_in", partySize: 2 }, ["pickup", "dine_in"], "2026-11-01T03:00:00Z")).toEqual({ orderType: "dine_in", partySize: 2 });
    expect("error" in cleanOrderOptions({ orderType: "dine_in", partySize: 2 }, ["pickup"], "2026-11-01T03:00:00Z")).toBe(true);
    expect("error" in cleanOrderOptions({ orderType: "dine_in", partySize: 2 }, ["dine_in"], null)).toBe(true);
    expect(cleanOrderOptions({}, ["pickup"], null)).toEqual({ orderType: "pickup", partySize: null });
    expect(cleanOrderModes(["dine_in", "x"])).toEqual(["dine_in"]);
    expect(canRequestCancel("accepted", "none")).toBe(true);
    expect(canRequestCancel("accepted", "denied")).toBe(false);
    expect(canRequestCancel("requested", "none")).toBe(false);
    const now = new Date("2026-11-30T00:00:00Z").getTime();
    expect(canReviewOrder("completed", "2026-11-20T00:00:00Z", now)).toBe(true);
    expect(canReviewOrder("completed", "2026-10-20T00:00:00Z", now)).toBe(false);
    expect(canReviewOrder("no_show", "2026-11-29T00:00:00Z", now)).toBe(false);
    expect("error" in cleanStoreReview({ reservationId: 1, rating: 5, content: "짧아요" })).toBe(true);
    expect(cleanStoreReview({ reservationId: 1, rating: 5, content: "강아지와 편하게 먹었어요" })).toEqual({ reservationId: 1, rating: 5, content: "강아지와 편하게 먹었어요" });
    expect(canChangeStatus("customer", "ready", "cancelled")).toBe(false);
    expect(canChangeStatus("customer", "requested", "accepted")).toBe(false);
  });
  it("끝난 예약은 진행 중으로 세지 않는다", () => {
    expect(isOpenStatus("ready")).toBe(true);
    expect(isOpenStatus("completed")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
  });
});

describe("예약 내역 만들기", () => {
  const products = [
    { id: 1, name: "육포", price: 5000, is_active: true },
    { id: 2, name: "케이크", price: 12000, is_active: true },
    { id: 3, name: "품절 간식", price: 1000, is_active: false },
    { id: 4, name: "다 팔린 케이크", price: 9000, is_active: true, sold_out: true },
  ];
  it("이름과 가격은 손님이 보낸 값이 아니라 가게가 올린 값으로 채운다", () => {
    const built = buildReservationLines([{ productId: 1, qty: 2, price: 1, name: "가짜" }, { productId: 2, qty: 1 }], products);
    expect(built).toEqual({ lines: [{ productId: 1, name: "육포", price: 5000, qty: 2 }, { productId: 2, name: "케이크", price: 12000, qty: 1 }], total: 22000 });
  });
  it("같은 상품을 두 번 담으면 합친다", () => {
    const built = buildReservationLines([{ productId: 1, qty: 1 }, { productId: 1, qty: 2 }], products);
    expect(built).toEqual({ lines: [{ productId: 1, name: "육포", price: 5000, qty: 3 }], total: 15000 });
  });
  it("꺼 둔 상품·없는 상품·이상한 수량은 거절한다", () => {
    expect(buildReservationLines([], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 3, qty: 1 }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 4, qty: 1 }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 99, qty: 1 }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 1, qty: 0 }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 1, qty: RESERVATION_QTY_MAX + 1 }], products)).toHaveProperty("error");
  });
});

describe("예약자 정보", () => {
  const now = new Date("2026-10-14T03:00:00Z").getTime();
  it("전화번호는 숫자만 남긴다", () => {
    expect(cleanReservationContact({ name: "홍길동", phone: "010-1234-5678" }, now)).toEqual({ name: "홍길동", phone: "01012345678", pickupAt: null, memo: null });
  });
  it("이름·전화가 없으면 거절한다", () => {
    expect(cleanReservationContact({ name: "", phone: "01012345678" }, now)).toHaveProperty("error");
    expect(cleanReservationContact({ name: "홍길동", phone: "123" }, now)).toHaveProperty("error");
  });
  it("가지러 갈 시간은 지금부터 정해진 날짜 안에서만", () => {
    expect(cleanReservationContact({ name: "홍길동", phone: "01012345678", pickupAt: new Date(now + 3_600_000).toISOString() }, now)).toHaveProperty("pickupAt", new Date(now + 3_600_000).toISOString());
    expect(cleanReservationContact({ name: "홍길동", phone: "01012345678", pickupAt: new Date(now - 3_600_000).toISOString() }, now)).toHaveProperty("error");
    expect(cleanReservationContact({ name: "홍길동", phone: "01012345678", pickupAt: new Date(now + (PICKUP_MAX_DAYS + 1) * 86_400_000).toISOString() }, now)).toHaveProperty("error");
  });
});

describe("요금제 단계", () => {
  it("모르는 값·빈 값은 가장 낮은 '프리미엄'으로 본다", () => {
    expect(normalizePlan(null)).toBe("premium");
    expect(normalizePlan("basic")).toBe("premium");
    expect(normalizePlan("store")).toBe("store");
    expect(normalizePlan("local")).toBe("local");
  });
  it("위 단계는 아래 단계의 기능을 모두 쓴다", () => {
    expect(planAtLeast("premium", "store")).toBe(false);
    expect(planAtLeast("store", "store")).toBe(true);
    expect(planAtLeast("local", "store")).toBe(true);
    expect(planAtLeast(null, "premium")).toBe(false);
  });
  it("할인 구간은 단계별 정가에 그대로 적용된다", () => {
    const q = quote(4, 0, PLAN_MONTHLY_PRICE.store);
    expect(q.perMonth).toEqual([0, 16500, 16500, 33000]);
  });
});

describe("동네 배너 광고", () => {
  const now = new Date("2026-10-14T00:00:00Z").getTime();
  const place = (over: Partial<AdPlace>): AdPlace => ({ id: 1, name: "가게", category: null, image_url: null, address: "경북 포항시 남구 대잠동 1", is_premium: true, premium_expires_at: "2099-01-01", premium_plan: "local", ...over });
  const noPerks = new Map<number, BannerPerk>();

  it("'동네 대표' 요금제이거나 관리자가 배너 혜택을 켜 준 가게만 배너에 나온다", () => {
    expect(bannerSource(place({}), null, now)).toBe("plan");
    expect(bannerSource(place({ premium_plan: "store" }), null, now)).toBe(null);
    expect(bannerSource(place({ premium_plan: "store" }), { banner_ad: true, banner_until: null }, now)).toBe("perk");
    expect(bannerSource(place({ premium_plan: null }), { banner_ad: true, banner_until: "2026-10-01T00:00:00Z" }, now)).toBe(null);
    expect(bannerSource(place({ premium_expires_at: "2026-10-01T00:00:00Z" }), null, now)).toBe(null);
    expect(bannerSource(place({ is_premium: false }), { banner_ad: true }, now)).toBe(null);
  });
  it("주소의 띄어쓰기가 달라도 같은 시·군·구로 본다", () => {
    expect(isInSigungu("경북 포항시 남구 대잠동 1", "포항시 남구")).toBe(true);
    expect(isInSigungu("경북 포항시남구 대잠동 1", "포항시 남구")).toBe(true);
    expect(isInSigungu("경북 포항시 북구 1", "포항시 남구")).toBe(false);
    expect(isInSigungu("경북 포항시 남구 1", "")).toBe(false);
  });
  it("같은 시·군·구의 가게만 고르고, 주소는 내려주지 않는다", () => {
    const picked = pickLocalAds([place({ id: 1 }), place({ id: 2, premium_plan: "store" }), place({ id: 3, address: "서울 강남구 1" }), place({ id: 4, premium_plan: null })], noPerks, "포항시 남구", now);
    expect(picked.map((p) => p.id)).toEqual([1]);
    expect(picked[0]).not.toHaveProperty("address");
  });
  it("위치를 모르면 아무 가게도 고르지 않는다", () => {
    expect(pickLocalAds([place({})], noPerks, null, now)).toEqual([]);
  });
  it("여러 곳이면 10분마다 앞자리가 한 칸씩 돌아간다", () => {
    const list = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const first = rotateByTime(list, 0).map((p) => p.id);
    expect(first).toEqual([1, 2, 3]);
    expect(rotateByTime(list, BANNER_ROTATE_MS).map((p) => p.id)).toEqual([2, 3, 1]);
    expect(rotateByTime(list, BANNER_ROTATE_MS * 2).map((p) => p.id)).toEqual([3, 1, 2]);
    expect(rotateByTime(list, BANNER_ROTATE_MS * 3).map((p) => p.id)).toEqual(first);
  });
  it("배너 구역은 시·도와 시·군·구로, 시 아래 구가 있으면 구까지", () => {
    expect(bannerRegionOf("경북 포항시 남구 대잠동 1")).toBe("경북 포항시 남구");
    expect(bannerRegionOf("서울 강남구 테헤란로 1")).toBe("서울 강남구");
    expect(bannerRegionOf("경남 거창군 거창읍 1")).toBe("경남 거창군");
    expect(bannerRegionOf("")).toBe("지역 모름");
  });
  it("한 동네의 배너 가게 수에는 제한이 없다", () => {
    const many = Array.from({ length: 12 }, (_, i) => place({ id: i + 1 }));
    expect(pickLocalAds(many, noPerks, "포항시 남구", now).length).toBe(12);
  });
});

describe("프리미엄 기간을 며칠 늘리고 줄이기", () => {
  const now = new Date("2026-10-14T00:00:00Z").getTime();
  const day = 86_400_000;
  it("남은 기간이 있으면 만료일에서 이어서 늘린다", () => {
    expect(adjustExpiry(new Date(now + 10 * day).toISOString(), 7, now)).toEqual({ expiresAt: new Date(now + 17 * day).toISOString(), ended: false });
  });
  it("이미 끝난 가게는 오늘부터 다시 센다", () => {
    expect(adjustExpiry(new Date(now - 5 * day).toISOString(), 7, now)).toEqual({ expiresAt: new Date(now + 7 * day).toISOString(), ended: false });
    expect(adjustExpiry(null, 1, now)).toEqual({ expiresAt: new Date(now + day).toISOString(), ended: false });
  });
  it("줄이면 만료일에서 빼고, 남는 기간이 없으면 바로 종료한다", () => {
    expect(adjustExpiry(new Date(now + 10 * day).toISOString(), -7, now)).toEqual({ expiresAt: new Date(now + 3 * day).toISOString(), ended: false });
    expect(adjustExpiry(new Date(now + 3 * day).toISOString(), -7, now)).toEqual({ expiresAt: new Date(now).toISOString(), ended: true });
  });
  it("0·소수·너무 큰 숫자, 이미 끝난 가게 줄이기는 거절한다", () => {
    expect(adjustExpiry(new Date(now + day).toISOString(), 0, now)).toHaveProperty("error");
    expect(adjustExpiry(new Date(now + day).toISOString(), 1.5, now)).toHaveProperty("error");
    expect(adjustExpiry(new Date(now + day).toISOString(), 1000, now)).toHaveProperty("error");
    expect(adjustExpiry(new Date(now - day).toISOString(), -1, now)).toHaveProperty("error");
  });
});

describe("포장 주문은 당일만", () => {
  // 2026-11-01 12:00 (한국 시간)
  const noon = new Date("2026-11-01T03:00:00Z").getTime();
  it("오늘 시간이거나 시간을 정하지 않으면 받는다", () => {
    expect(cleanOrderOptions({ orderType: "pickup" }, ["pickup"], "2026-11-01T14:50:00Z", noon)).toEqual({ orderType: "pickup", partySize: null });
    expect(cleanOrderOptions({ orderType: "pickup" }, ["pickup"], null, noon)).toEqual({ orderType: "pickup", partySize: null });
  });
  it("한국 시간으로 내일이면 받지 않는다", () => {
    expect(cleanOrderOptions({ orderType: "pickup" }, ["pickup"], "2026-11-01T15:10:00Z", noon)).toHaveProperty("error");
  });
  it("매장 식사는 다른 날도 예약할 수 있다", () => {
    expect(cleanOrderOptions({ orderType: "dine_in", partySize: 2 }, ["dine_in"], "2026-11-05T03:00:00Z", noon)).toEqual({ orderType: "dine_in", partySize: 2 });
  });
});

describe("포장 주문 가능 시간", () => {
  // 2026-11-01 12:00 (한국 시간)
  const noon = new Date("2026-11-01T03:00:00Z").getTime();
  it("정하지 않았으면 제한이 없다", () => {
    expect(isWithinOrderHours(null, null, noon)).toBe(true);
  });
  it("한국 시간으로 범위 안에서만 받는다", () => {
    expect(isWithinOrderHours("11:00", "20:00", noon)).toBe(true);
    expect(isWithinOrderHours("13:00", "20:00", noon)).toBe(false);
    expect(isWithinOrderHours("09:00", "12:00", noon)).toBe(false);
  });
  it("자정을 넘기는 영업도 처리한다", () => {
    expect(isWithinOrderHours("18:00", "02:00", noon)).toBe(false);
    expect(isWithinOrderHours("18:00", "02:00", new Date("2026-11-01T16:00:00Z").getTime())).toBe(true);
  });
});

describe("메뉴 옵션", () => {
  const size = { name: "사이즈", required: true, multi: false, choices: [{ name: "TALL", price: 0 }, { name: "GRANDE", price: 1000 }] };
  const extra = { name: "추가", required: false, multi: true, choices: [{ name: "치즈", price: 500 }, { name: "연어", price: 800 }] };
  const products = [{ id: 1, name: "멍푸치노", price: 6000, is_active: true, options: [size, extra] }];
  it("옵션 금액은 가게 값으로 더하고 이름에 적는다", () => {
    const built = buildReservationLines([{ productId: 1, qty: 2, options: [{ group: "사이즈", choice: "GRANDE" }, { group: "추가", choice: "치즈" }], price: 1 }], products);
    expect(built).toEqual({ lines: [{ productId: 1, name: "멍푸치노 (GRANDE, 치즈)", price: 7500, qty: 2, options: [{ group: "사이즈", choice: "GRANDE" }, { group: "추가", choice: "치즈" }] }], total: 15000 });
  });
  it("옵션이 다르면 다른 줄이 된다", () => {
    const built = buildReservationLines([{ productId: 1, qty: 1, options: [{ group: "사이즈", choice: "TALL" }] }, { productId: 1, qty: 1, options: [{ group: "사이즈", choice: "GRANDE" }] }], products);
    expect(built).toHaveProperty("total", 13000);
  });
  it("필수 옵션이 없거나, 없는 선택지거나, 하나만 고를 옵션을 여러 개 고르면 막는다", () => {
    expect(buildReservationLines([{ productId: 1, qty: 1 }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 1, qty: 1, options: [{ group: "사이즈", choice: "VENTI" }] }], products)).toHaveProperty("error");
    expect(buildReservationLines([{ productId: 1, qty: 1, options: [{ group: "사이즈", choice: "TALL" }, { group: "사이즈", choice: "GRANDE" }] }], products)).toHaveProperty("error");
  });
  it("입력을 다듬을 때 이름 없는 옵션과 선택지를 뺀다", () => {
    expect(cleanProductOptions([{ name: " ", choices: [{ name: "A" }] }, { name: "맛", choices: [{ name: "" }, { name: "닭", price: -5 }] }])).toEqual([{ name: "맛", required: false, multi: false, choices: [{ name: "닭", price: 0 }] }]);
  });
});

describe("가게 안내", () => {
  it("비어 있으면 기본값, 이상한 숫자는 버린다", () => {
    expect(cleanStoreInfo(null).minOrder).toBe(0);
    expect(cleanStoreInfo({ minOrder: -1, prepMinutes: 9999 })).toMatchObject({ minOrder: 0, prepMinutes: null });
    expect(cleanStoreInfo({ minOrder: 10000, prepMinutes: 20 })).toMatchObject({ minOrder: 10000, prepMinutes: 20 });
  });
});

describe("요일별 주문 시간", () => {
  // 2026-11-01은 일요일(한국 시간 12:00)
  const sunday = new Date("2026-11-01T03:00:00Z").getTime();
  const week = (day: unknown) => [day, null, null, null, null, null, null];
  it("그 요일 시간이 있으면 먼저 쓰고, 없으면 기본 시간", () => {
    expect(orderHoursToday({ order_open_time: "09:00", order_close_time: "18:00", order_week: week({ open: "11:00", close: "15:00" }) }, sunday)).toEqual({ open: "11:00", close: "15:00", closedDay: false });
    expect(orderHoursToday({ order_open_time: "09:00", order_close_time: "18:00" }, sunday)).toEqual({ open: "09:00", close: "18:00", closedDay: false });
  });
  it("안 받는 날", () => {
    expect(orderHoursToday({ order_week: week({ closed: true }) }, sunday).closedDay).toBe(true);
  });
  it("한국 시간 기준으로 요일을 정한다", () => {
    // 11월 1일 15:30 UTC = 한국 11월 2일 월요일
    expect(orderHoursToday({ order_week: week({ closed: true }) }, new Date("2026-11-01T15:30:00Z").getTime()).closedDay).toBe(false);
  });
  it("다 비우면 요일별 설정이 없는 것", () => {
    expect(cleanOrderWeek([{ open: "", close: "" }])).toBeNull();
  });
});

describe("쿠폰", () => {
  const now = new Date("2026-11-01T03:00:00Z").getTime();
  const base = { discount: 1000, min_order: 5000, expires_on: "2026-11-30", is_active: true };
  it("조건을 채우면 쓸 수 있다", () => expect(couponProblem(base, 6000, now)).toBeNull());
  it("꺼졌거나 지났거나 금액이 모자라면 못 쓴다", () => {
    expect(couponProblem({ ...base, is_active: false }, 6000, now)).toBeTruthy();
    expect(couponProblem({ ...base, expires_on: "2026-10-31" }, 6000, now)).toBeTruthy();
    expect(couponProblem(base, 4000, now)).toBeTruthy();
  });
  it("할인이 주문 금액 이상이면 못 쓴다", () => expect(couponProblem({ ...base, min_order: 0 }, 1000, now)).toBeTruthy());
  it("만들 때 할인은 최소 주문보다 작아야 한다", () => {
    expect(cleanCoupon({ name: "첫 주문", discount: 5000, minOrder: 5000 })).toHaveProperty("error");
    expect(cleanCoupon({ name: "첫 주문", discount: 1000, minOrder: 5000, expiresOn: "2026-12-01" })).toEqual({ coupon: { name: "첫 주문", discount: 1000, min_order: 5000, expires_on: "2026-12-01" } });
  });
});

describe("후기 사진", () => {
  const url = "https://x.supabase.co";
  const ok = `${url}/storage/v1/object/public/community-images/store-reviews/u/1.jpg`;
  it("후기 폴더의 사진만 3장까지 받는다", () => {
    expect(cleanReviewPhotos([ok, "https://evil.example/a.jpg", ok, ok, ok], url)).toEqual([ok, ok, ok]);
  });
});
