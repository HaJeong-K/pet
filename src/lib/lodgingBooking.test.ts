import { describe, expect, it } from "vitest";
import {
  addDays, canChangeStay, cleanStayRequest, isDay, isWeekendNight, kstToday, nightPrice, nightsOf, petsAllowed, quoteStay, staysOverlap,
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
  });
  it("목·금 2박, 3명, 반려동물 2마리", () => {
    const q = quoteStay(room, 10000, [], "2026-11-05", "2026-11-07", 3, 2);
    expect("error" in q).toBe(false);
    if ("error" in q) return;
    expect(q.roomTotal).toBe(250000);
    expect(q.extraGuestTotal).toBe(40000);
    expect(q.petTotal).toBe(40000);
    expect(q.total).toBe(330000);
  });
  it("막은 날이 끼면 예약 불가", () => {
    expect("error" in quoteStay(room, 0, [{ day: "2026-11-06", closed: true, price: null }], "2026-11-05", "2026-11-07", 2, 1)).toBe(true);
  });
  it("최대 인원 초과 불가", () => {
    expect("error" in quoteStay(room, 0, [], "2026-11-05", "2026-11-06", 5, 1)).toBe(true);
  });
});

describe("예약 요청 다듬기", () => {
  const ok = { roomId: 3, checkIn: "2026-11-05", checkOut: "2026-11-07", guests: 2, pets: [{ species: "dog", size: "small", weight: "5.25", name: " 콩이 " }], name: "김보호", phone: "010-1234-5678" };
  it("정상 요청", () => {
    const r = cleanStayRequest(ok, NOW);
    expect("request" in r).toBe(true);
    if (!("request" in r)) return;
    expect(r.request.phone).toBe("01012345678");
    expect(r.request.pets[0]).toEqual({ species: "dog", size: "small", weight: 5.3, name: "콩이" });
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
  });
  it("동반 규정을 안 적은 숙소는 사장님 판단", () => {
    expect(petsAllowed(null, { max_pets: null }, [dog("large", 40)])).toBeNull();
  });
});

describe("예약 상태", () => {
  it("사장님은 대기→확정/거절, 확정→완료/노쇼/취소", () => {
    expect(canChangeStay("owner", "requested", "confirmed")).toBe(true);
    expect(canChangeStay("owner", "confirmed", "no_show")).toBe(true);
    expect(canChangeStay("owner", "declined", "confirmed")).toBe(false);
  });
  it("손님은 대기·확정 상태에서 취소만", () => {
    expect(canChangeStay("guest", "requested", "cancelled_by_guest")).toBe(true);
    expect(canChangeStay("guest", "confirmed", "cancelled_by_guest")).toBe(true);
    expect(canChangeStay("guest", "completed", "cancelled_by_guest")).toBe(false);
    expect(canChangeStay("guest", "requested", "confirmed")).toBe(false);
  });
});
