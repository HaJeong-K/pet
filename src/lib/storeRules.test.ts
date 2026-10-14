import { describe, it, expect } from "vitest";
import { buildReservationLines, canChangeStatus, cleanProduct, cleanReservationContact, isOpenStatus, ownerNextStatuses, PICKUP_MAX_DAYS, RESERVATION_QTY_MAX } from "./storeRules";
import { normalizePlan, planAtLeast, PLAN_MONTHLY_PRICE, quote } from "./ownerPlans";
import { BANNER_ROTATE_MS, bannerRegionOf, bannerSource, isInSigungu, pickLocalAds, rotateByTime, type AdPlace, type BannerPerk } from "./localAds";
import { adjustExpiry } from "./premiumPeriod";

describe("상품 입력값", () => {
  it("이름 앞뒤 공백을 다듬고 그대로 받는다", () => {
    expect(cleanProduct({ name: "  수제  육포 ", price: 5000 })).toEqual({ product: { name: "수제 육포", description: null, price: 5000, is_active: true } });
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
    expect(canChangeStatus("customer", "accepted", "cancelled")).toBe(true);
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
