import { describe, expect, it } from "vitest";
import { cleanCashReceiptNumber,
  addDays, canChangeStay, cleanStayRequest, isDay, isWeekendNight, kstToday, nightPrice, nightsOf, petNightFee, petsNightlyTotal, petsAllowed, quoteStay, staysOverlap,
} from "./lodgingBooking";

const NOW = new Date("2026-10-25T03:00:00Z").getTime(); // 한국 2026-10-25 12시(일요일)

describe("날짜", () => {
  it("한국 날짜·하루 더하기·밤 목록", () => {
    expect(kstToday(new Date("2026-10-25T16:00:00Z").getTime())).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(nightsOf("2026-11-06", "2026-11-08")).toEqual(["2026-11-06", "2026-11-07"]);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-11-06")).toBe(true);
  });
  it("금·토요일 밤이 주말", () => {
    expect(isWeekendNight("2026-11-06")).toBe(true); // 금
    expect(isWeekendNight("2026-11-07")).toBe(true); // 토
    expect(isWeekendNight("2026-11-08")).toBe(false); // 일
  });
  it("체크아웃 날 다음 손님 체크인은 겹치지 않음", () => {
    expect(staysOverlap("2026-11-01", "2026-11-03", "2026-11-03", "2026-11-05")).toBe(false);
    expect(staysOverlap("2026-11-01", "2026-11-04", "2026-11-03", "2026-11-05")).toBe(true);
  });
});

describe("요금", () => {
  const room = { base_price: 100000, weekend_price: 150000, std_guests: 2, max_guests: 4, extra_guest_fee: 20000 };
  it("날짜별 요금이 평일·주말 요금보다 먼저", () => {
    expect(nightPrice(room, "2026-11-05")).toBe(100000);
    expect(nightPrice(room, "2026-11-06")).toBe(150000);
    expect(nightPrice(room, "2026-11-05", { day: "2026-11-05", closed: false, price: 80000 })).toBe(80000);
    // 요일별 요금: 목요일(4) 9만 원, 날짜별 요금이 있으면 그게 먼저
    const byDay = { ...room, weekday_prices: [null, null, null, null, 90000, null, null] };
    expect(nightPrice(byDay, "2026-11-05")).toBe(90000);
    expect(nightPrice(byDay, "2026-11-06")).toBe(150000);
    expect(nightPrice(byDay, "2026-11-05", { day: "2026-11-05", closed: false, price: 80000 })).toBe(80000);
  });
  it("목·금 2박, 3명, 반려동물 2마리", () => {
    // 반려동물 2마리 × 1만 원 = 1박 2만 원
    const q = quoteStay(room, 20000, [], "2026-11-05", "2026-11-07", 3);
    expect("error" in q).toBe(false);
    if ("error" in q) return;
    expect(q.roomTotal).toBe(250000);
    expect(q.extraGuestTotal).toBe(40000);
    expect(q.petTotal).toBe(40000);
    expect(q.total).toBe(330000);
  });
  it("막은 날이 끼면 예약 불가", () => {
    expect("error" in quoteStay(room, 0, [{ day: "2026-11-06", closed: true, price: null }], "2026-11-05", "2026-11-07", 2)).toBe(true);
  });
  it("최대 인원 초과 불가", () => {
    expect("error" in quoteStay(room, 0, [], "2026-11-05", "2026-11-06", 5)).toBe(true);
  });
  it("부가 옵션: 1회·1박마다·1인당, 최대 수량·없는 옵션 막기", () => {
    const extras = [
      { id: "bbq", name: "바비큐", price: 30000, unit: "stay" as const, max: 2, note: null },
      { id: "fire", name: "불멍", price: 10000, unit: "night" as const, max: 1, note: null },
      { id: "meal", name: "조식", price: 12000, unit: "person" as const, max: 4, note: null },
    ];
    const q = quoteStay(room, 0, [], "2026-11-05", "2026-11-07", 2, [{ id: "bbq", qty: 1 }, { id: "fire", qty: 1 }, { id: "meal", qty: 2 }], extras);
    expect("error" in q).toBe(false);
    if ("error" in q) return;
    expect(q.extras.map((x) => x.amount)).toEqual([30000, 20000, 24000]);
    expect(q.extrasTotal).toBe(74000);
    expect(q.total).toBe(250000 + 74000);
    expect("error" in quoteStay(room, 0, [], "2026-11-05", "2026-11-07", 2, [{ id: "bbq", qty: 3 }], extras)).toBe(true);
    expect("error" in quoteStay(room, 0, [], "2026-11-05", "2026-11-07", 2, [{ id: "spa", qty: 1 }], extras)).toBe(true);
  });
  it("반려동물 추가 요금: 크기·종류별 요금이 있으면 그것, 없으면 기본", () => {
    const profile = { pet_fee: 10000, pet_fees: { large: 20000, cat: 5000 } };
    expect(petNightFee(profile, { species: "dog", size: "small" })).toBe(10000);
    expect(petNightFee(profile, { species: "dog", size: "large" })).toBe(20000);
    expect(petNightFee(profile, { species: "cat", size: null })).toBe(5000);
    expect(petNightFee({ pet_fee: null }, { species: "dog", size: "large" })).toBe(0);
    // 기본 포함 1마리: 낮은 요금부터 빼고 나머지만 더함
    const pets = [{ species: "dog" as const, size: "small" as const }, { species: "dog" as const, size: "large" as const }];
    expect(petsNightlyTotal(profile, pets)).toBe(30000);
    expect(petsNightlyTotal({ ...profile, pet_free_count: 1 }, pets)).toBe(20000);
    expect(petsNightlyTotal({ ...profile, pet_free_count: 5 }, pets)).toBe(0);
  });
});

describe("예약 요청 다듬기", () => {
  const ok = { roomId: 3, checkIn: "2026-11-05", checkOut: "2026-11-07", guests: 2, pets: [{ species: "dog", size: "small", weight: "5.25", name: " 콩이 " }], name: "김보호", phone: "010-1234-5678", arrivalMethod: "car", consents: ["rules", "privacy", "third_party", "age14"] };
  it("정상 요청", () => {
    const r = cleanStayRequest(ok, NOW);
    expect("request" in r).toBe(true);
    if (!("request" in r)) return;
    expect(r.request.phone).toBe("01012345678");
    // 이름은 이제 받지 않습니다(보내도 버림)
    expect(r.request.pets[0]).toEqual({ species: "dog", size: "small", weight: 5.3, kind: null, breed: null });
  });
  it("예약자와 다른 이용자·방문 수단·도착 시각·이메일", () => {
    const r = cleanStayRequest({ ...ok, email: " a@b.co ", sameGuest: false, stayGuestName: " 이용자 ", stayGuestPhone: "010 9999 8888", arrivalTime: "16:30" }, NOW);
    expect("request" in r && [r.request.email, r.request.stayGuestName, r.request.stayGuestPhone, r.request.arrivalMethod, r.request.arrivalTime]).toEqual(["a@b.co", "이용자", "01099998888", "car", "16:30"]);
    expect("request" in cleanStayRequest(ok, NOW) && (cleanStayRequest(ok, NOW) as { request: { stayGuestName: null } }).request.stayGuestName).toBeNull();
    expect("error" in cleanStayRequest({ ...ok, sameGuest: false, stayGuestName: "이용자" }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, arrivalMethod: undefined }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, email: "메일" }, NOW)).toBe(true);
  });
  it("필수 동의를 하나라도 빼면 막기", () => {
    expect("error" in cleanStayRequest({ ...ok, consents: ["rules", "privacy", "age14"] }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, consents: undefined }, NOW)).toBe(true);
  });
  it("지난 날짜·0박·너무 긴 숙박 막기", () => {
    expect("error" in cleanStayRequest({ ...ok, checkIn: "2026-10-24" }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, checkOut: "2026-11-05" }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, checkOut: "2026-11-25" }, NOW)).toBe(true);
  });
  it("반려동물 정보는 필수, 강아지는 크기 필수", () => {
    expect("error" in cleanStayRequest({ ...ok, pets: [] }, NOW)).toBe(true);
    expect("error" in cleanStayRequest({ ...ok, pets: [{ species: "dog" }] }, NOW)).toBe(true);
    expect("request" in cleanStayRequest({ ...ok, pets: [{ species: "cat" }] }, NOW)).toBe(true);
  });
  it("견종·부가 옵션", () => {
    const r = cleanStayRequest({ ...ok, pets: [{ species: "dog", size: "small", breed: " 말티푸 " }], extras: [{ id: "bbq", qty: 2 }] }, NOW);
    expect("request" in r && [r.request.pets[0].breed, r.request.extras]).toEqual(["말티푸", [{ id: "bbq", qty: 2 }]]);
    expect("error" in cleanStayRequest({ ...ok, extras: [{ id: "bbq", qty: 0 }] }, NOW)).toBe(true);
  });
  it("그 외 동물은 어떤 동물인지 필수", () => {
    expect("error" in cleanStayRequest({ ...ok, pets: [{ species: "other" }] }, NOW)).toBe(true);
    const r = cleanStayRequest({ ...ok, pets: [{ species: "other", kind: " 토끼 ", size: "large" }] }, NOW);
    expect("request" in r && r.request.pets[0]).toEqual({ species: "other", size: null, weight: null, kind: "토끼", breed: null });
  });
});

describe("동반 규정 확인", () => {
  const profile = { pet_species: ["dog" as const], pet_sizes: ["small" as const, "medium" as const], max_pet_weight_kg: 10, max_pets: 2 };
  const dog = (size: "small" | "medium" | "large", weight: number | null = null) => ({ species: "dog" as const, size, weight, name: null });
  it("규정에 맞으면 통과", () => {
    expect(petsAllowed(profile, { max_pets: null }, [dog("small", 5)])).toBeNull();
  });
  it("크기·몸무게·마릿수·종류", () => {
    expect(petsAllowed(profile, { max_pets: null }, [dog("large")])).not.toBeNull();
    expect(petsAllowed(profile, { max_pets: null }, [dog("medium", 12)])).not.toBeNull();
    expect(petsAllowed(profile, { max_pets: 1 }, [dog("small"), dog("small")])).not.toBeNull();
    expect(petsAllowed(profile, { max_pets: null }, [{ species: "cat", size: null, weight: null, name: null }])).not.toBeNull();
    expect(petsAllowed(profile, { max_pets: null }, [{ species: "other", size: null, weight: null, kind: "토끼" }])).not.toBeNull();
    expect(petsAllowed({ ...profile, pet_species: ["dog", "other"] }, { max_pets: null }, [{ species: "other", size: null, weight: 2, kind: "토끼" }])).toBeNull();
  });
  it("동반 규정을 안 적은 숙소는 사장님 판단", () => {
    expect(petsAllowed(null, { max_pets: null }, [dog("large", 40)])).toBeNull();
  });
});

describe("예약 상태", () => {
  it("사장님은 대기→확정/거절, 확정→노쇼/취소(완료는 손님 확정으로만)", () => {
    expect(canChangeStay("owner", "confirmed", "completed")).toBe(false);
    expect(canChangeStay("owner", "requested", "confirmed")).toBe(true);
    expect(canChangeStay("owner", "confirmed", "no_show")).toBe(true);
    expect(canChangeStay("owner", "declined", "confirmed")).toBe(false);
  });
  it("손님은 대기·확정 상태에서 취소만", () => {
    expect(canChangeStay("guest", "requested", "cancelled_by_guest")).toBe(true);
    expect(canChangeStay("guest", "confirmed", "cancelled_by_guest")).toBe(true);
    expect(canChangeStay("guest", "completed", "cancelled_by_guest")).toBe(false);
    expect(canChangeStay("guest", "requested", "confirmed")).toBe(false);
    expect(canChangeStay("guest", "confirmed", "completed")).toBe(true);
  });
});

describe("추가 옵션·현금영수증·반려동물 정보", () => {
  const room = { base_price: 100000, weekend_price: null, weekday_prices: null, std_guests: 2, max_guests: 4, extra_guest_fee: 20000 } as never;
  const bbq = { id: "b", name: "바비큐", price: 30000, unit: "day", max: 2, note: null } as never;
  const towel = { id: "t", name: "침구", price: 10000, unit: "night", max: 1, note: null } as never;
  it("이용일마다 옵션은 고른 날 수만큼만 받는다", () => {
    const q = quoteStay(room, 0, [], "2026-11-02", "2026-11-05", 2, [{ id: "b", qty: 1, days: ["2026-11-02", "2026-11-04"] }], [bbq]);
    expect("error" in q).toBe(false);
    if (!("error" in q)) { expect(q.extras[0].amount).toBe(60000); expect(q.extras[0].days).toEqual(["2026-11-02", "2026-11-04"]); }
  });
  it("숙박 기간 밖의 날이나 빈 날짜는 받지 않는다", () => {
    expect("error" in quoteStay(room, 0, [], "2026-11-02", "2026-11-03", 2, [{ id: "b", qty: 1, days: ["2026-12-01"] }], [bbq])).toBe(true);
    expect("error" in quoteStay(room, 0, [], "2026-11-02", "2026-11-03", 2, [{ id: "b", qty: 1 }], [bbq])).toBe(true);
  });
  it("1박마다 옵션과 인원 추가금은 박 수만큼 받는다", () => {
    const q = quoteStay(room, 0, [], "2026-11-02", "2026-11-04", 3, [{ id: "t", qty: 1 }], [towel]);
    if ("error" in q) throw new Error(q.error);
    expect(q.extrasTotal).toBe(20000);
    expect(q.extraGuestTotal).toBe(40000);
  });
  it("현금영수증 번호를 확인한다", () => {
    expect(cleanCashReceiptNumber("income", "010-1234-5678")).toBe("01012345678");
    expect(cleanCashReceiptNumber("income", "123")).toBeNull();
    expect(cleanCashReceiptNumber("expense", "123-45-67890")).toBe("1234567890");
    expect(cleanCashReceiptNumber("none", "01012345678")).toBeNull();
  });
  it("입실 조건에 맞지 않는 나이·중성화는 막는다", () => {
    const profile = { pet_species: ["dog"], pet_sizes: ["small"], max_pet_weight_kg: null, max_pets: null, pet_requirements: { min_age_months: 5, neutered: true } } as never;
    const pet = { species: "dog", size: "small", weight: null } as const;
    expect(petsAllowed(profile, { max_pets: null } as never, [{ ...pet, age_months: 3 }])).toContain("5개월");
    expect(petsAllowed(profile, { max_pets: null } as never, [{ ...pet, age_months: 24, neutered: false }])).toContain("중성화");
    expect(petsAllowed(profile, { max_pets: null } as never, [{ ...pet, age_months: 24, neutered: true }])).toBeNull();
  });
});
