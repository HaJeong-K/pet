import { describe, expect, it } from "vitest";
import { canReviewStay, cleanReview, cleanReviewReport, maskName, summarizeReviews } from "./lodgingReviews";

describe("숙박 후기 다듬기", () => {
  const ok = { bookingId: 7, rating: 5, clean_rating: 4, content: "  마당이 넓어서 콩이가 정말 좋아했어요  " };
  it("정상 후기", () => {
    const r = cleanReview(ok);
    expect("review" in r && r.review).toEqual({ bookingId: 7, rating: 5, clean_rating: 4, service_rating: null, pet_rating: null, content: "마당이 넓어서 콩이가 정말 좋아했어요" });
  });
  it("별점·글자 수 확인", () => {
    expect("error" in cleanReview({ ...ok, rating: 0 })).toBe(true);
    expect("error" in cleanReview({ ...ok, rating: 4.5 })).toBe(true);
    expect("error" in cleanReview({ ...ok, pet_rating: 6 })).toBe(true);
    expect("error" in cleanReview({ ...ok, content: "좋아요" })).toBe(true);
  });
});

describe("후기 신고 다듬기", () => {
  it("사유 필수, 기타는 설명 필수", () => {
    expect(cleanReviewReport({ reason: "abuse", detail: "  욕설이 있어요 " })).toEqual({ reason: "abuse", detail: "욕설이 있어요" });
    expect("error" in cleanReviewReport({ reason: "없는 사유" })).toBe(true);
    expect("error" in cleanReviewReport({ reason: "etc" })).toBe(true);
  });
});

describe("후기 쓸 수 있는 예약", () => {
  it("확정·완료 예약만, 체크아웃 날부터", () => {
    expect(canReviewStay({ status: "confirmed", check_out: "2026-10-28" }, "2026-10-28")).toBe(true);
    expect(canReviewStay({ status: "completed", check_out: "2026-10-20" }, "2026-10-28")).toBe(true);
    expect(canReviewStay({ status: "confirmed", check_out: "2026-10-29" }, "2026-10-28")).toBe(false);
    expect(canReviewStay({ status: "cancelled_by_guest", check_out: "2026-10-20" }, "2026-10-28")).toBe(false);
  });
});

describe("이름 가리기·요약", () => {
  it("가운데 글자를 가린다", () => {
    expect(maskName("김보호")).toBe("김*호");
    expect(maskName("이준")).toBe("이*");
    expect(maskName("")).toBe("손님");
  });
  it("평균·별점별 개수", () => {
    const s = summarizeReviews([
      { rating: 5, clean_rating: 5, service_rating: null, pet_rating: 4 },
      { rating: 4, clean_rating: 3, service_rating: null, pet_rating: null },
    ]);
    expect(s.average).toBe(4.5);
    expect(s.aspects).toEqual({ clean_rating: 4, service_rating: null, pet_rating: 4 });
    expect(s.stars).toEqual([1, 1, 0, 0, 0]);
  });
});
