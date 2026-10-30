import { describe, expect, it } from "vitest";
import { canReportViolation,
  addMonths, autoConfirmOn, cancelOutcome, guestPenaltyRate, isPeakDay, isWeekendStay, nextBusinessDayAfter, ownerCompensationRate,
  refundSchedule, settle, stayFeeRate,
} from "./lodgingPolicy";

// 2026-11-04(수) 비수기 주중, 2026-11-06(금) 비수기 주말, 2027-07-21(수) 성수기 주중, 2027-07-23(금) 성수기 주말
const t = (checkIn: string, cancelOn: string, bookedOn = "2026-01-01") => ({ checkIn, cancelOn, bookedOn });

describe("성수기·주말", () => {
  it("기본 성수기는 여름·겨울(해 넘김)", () => {
    expect(isPeakDay("2027-07-15", null)).toBe(true);
    expect(isPeakDay("2027-08-25", null)).toBe(false);
    expect(isPeakDay("2027-01-10", null)).toBe(true);
    expect(isPeakDay("2026-12-19", null)).toBe(false);
  });
  it("숙소가 정한 성수기가 기본값보다 먼저", () => {
    expect(isPeakDay("2026-10-10", [{ from: "10-01", to: "10-31" }])).toBe(true);
    expect(isPeakDay("2027-07-20", [{ from: "10-01", to: "10-31" }])).toBe(false);
  });
  it("금·토요일과 공휴일 전날이 주말", () => {
    expect(isWeekendStay("2026-11-06")).toBe(true);
    expect(isWeekendStay("2026-11-04")).toBe(false);
    expect(isWeekendStay("2026-10-08")).toBe(true); // 10/9 한글날 전날(목)
  });
});

describe("손님 사정 취소 공제율(별표 1)", () => {
  it("성수기 주중·주말", () => {
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-11"))).toBe(0);
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-14"))).toBe(10);
    expect(guestPenaltyRate(t("2027-07-23", "2027-07-16"))).toBe(20);
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-16"))).toBe(30);
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-18"))).toBe(50);
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-19"))).toBe(80); // 2일 전
    expect(guestPenaltyRate(t("2027-07-23", "2027-07-21"))).toBe(90);
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-21"))).toBe(80);
  });
  it("비수기 주중·주말", () => {
    expect(guestPenaltyRate(t("2026-11-04", "2026-11-02"))).toBe(0);
    expect(guestPenaltyRate(t("2026-11-04", "2026-11-03"))).toBe(10);
    expect(guestPenaltyRate(t("2026-11-06", "2026-11-05"))).toBe(20);
    expect(guestPenaltyRate(t("2026-11-04", "2026-11-04"))).toBe(20);
    expect(guestPenaltyRate(t("2026-11-06", "2026-11-06"))).toBe(30);
  });
  it("예약한 날 안에 취소하면 전액", () => {
    expect(guestPenaltyRate(t("2027-07-21", "2027-07-20", "2027-07-20"))).toBe(0);
  });
});

describe("숙소 사정 배상률(별표 2)", () => {
  it("성수기 2일 전~당일은 정하지 않음(null)", () => {
    expect(ownerCompensationRate(t("2027-07-21", "2027-07-14"))).toBe(10);
    expect(ownerCompensationRate(t("2027-07-21", "2027-07-20"))).toBeNull();
    expect(ownerCompensationRate(t("2026-11-06", "2026-11-06"))).toBe(30);
  });
});

describe("취소 결과", () => {
  it("계약 후 24시간 안, 이용일 0시 전까지는 위약금이 없다", () => {
    const at = (iso: string) => new Date(iso).getTime();
    const base = { checkIn: "2027-07-20", bookedOn: "2027-07-10", cancelOn: "2027-07-11", bookedAt: "2027-07-10T01:00:00Z" };
    expect(guestPenaltyRate({ ...base, cancelAt: at("2027-07-11T00:59:00Z") })).toBe(0);
    expect(guestPenaltyRate({ ...base, cancelAt: at("2027-07-11T01:01:00Z") })).toBeGreaterThan(0);
    // 12/30 오전 10시에 12/31 숙박 예약 → 12/31 0시부터는 위약금 적용
    const near = { checkIn: "2026-12-31", bookedOn: "2026-12-30", bookedAt: "2026-12-30T01:00:00Z" };
    expect(guestPenaltyRate({ ...near, cancelOn: "2026-12-30", cancelAt: at("2026-12-30T14:00:00Z") })).toBe(0);
    expect(guestPenaltyRate({ ...near, cancelOn: "2026-12-31", cancelAt: at("2026-12-30T16:00:00Z") })).toBeGreaterThan(0);
  });
  it("규정 위반은 체크인 날부터 체크아웃 후 14일까지 접수한다", () => {
    const b = { status: "confirmed", check_in: "2026-11-01", check_out: "2026-11-03", issue_status: "none" };
    expect(canReportViolation(b, "2026-10-31")).toBe(false);
    expect(canReportViolation(b, "2026-11-01")).toBe(true);
    expect(canReportViolation({ ...b, status: "completed" }, "2026-11-17")).toBe(true);
    expect(canReportViolation({ ...b, status: "completed" }, "2026-11-18")).toBe(false);
    expect(canReportViolation({ ...b, issue_status: "open" }, "2026-11-02")).toBe(false);
    expect(canReportViolation({ ...b, status: "cancelled_by_guest" }, "2026-11-02")).toBe(false);
  });
  it("손님 사정 → 환불 + 위약금", () => {
    expect(cancelOutcome(200000, "guest", t("2027-07-21", "2027-07-21"))).toMatchObject({ refund: 40000, penalty: 160000, compensation: 0 });
  });
  it("반려동물 정보를 다르게 적어 거부 → 당일 취소로", () => {
    expect(cancelOutcome(200000, "guest_pet_mismatch", t("2026-11-04", "2026-10-01"))).toMatchObject({ penalty: 40000 });
  });
  it("숙소 사정 → 전액 + 배상", () => {
    expect(cancelOutcome(200000, "owner", t("2026-11-06", "2026-11-05"))).toMatchObject({ refund: 200000, penalty: 0, compensation: 40000 });
    expect(cancelOutcome(200000, "owner_pet_refused", t("2027-07-21", "2027-07-01")).compensation).toBeNull();
  });
  it("불가항력·미확정 → 전액, 배상 없음", () => {
    expect(cancelOutcome(200000, "force_majeure", t("2027-07-21", "2027-07-21"))).toMatchObject({ refund: 200000, compensation: 0 });
  });
});

describe("날짜별 환불 안내", () => {
  it("비수기 주중: 이틀 전까지 전액, 전날 90%, 당일 80%", () => {
    expect(refundSchedule(100000, "2026-11-04", "2026-10-28")).toEqual([
      { until: "2026-11-02", refund: 100000, rate: 0 },
      { until: "2026-11-03", refund: 90000, rate: 10 },
      { until: "2026-11-04", refund: 80000, rate: 20 },
    ]);
  });
});

describe("수수료·정산", () => {
  it("입점일부터 3개월 5%, 이후 8%, 프리미엄은 늘 5%", () => {
    expect(stayFeeRate("2027-02-27", false, "2026-11-28")).toBe(5);
    expect(stayFeeRate("2027-02-28", false, "2026-11-28")).toBe(8);
    expect(stayFeeRate("2026-12-01", false, null)).toBe(8);
    expect(stayFeeRate("2027-07-01", true, null)).toBe(5);
  });
  it("개월 더하기(말일 맞춤)", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-10-28", 3)).toBe("2027-01-28");
  });
  it("정산 금액", () => {
    expect(settle(200000, 8)).toEqual({ fee: 16000, payout: 184000 });
    expect(settle(160000, 15)).toEqual({ fee: 24000, payout: 136000 });
  });
  it("자동 확정·정산일(쉬는 날 건너뜀)", () => {
    expect(autoConfirmOn("2026-11-05")).toBe("2026-11-08");
    expect(nextBusinessDayAfter("2026-11-06")).toBe("2026-11-09"); // 금 → 월
    expect(nextBusinessDayAfter("2026-10-08")).toBe("2026-10-12"); // 10/9 한글날·주말 건너뜀
  });
});
