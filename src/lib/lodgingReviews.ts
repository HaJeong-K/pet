// 숙박 후기(별점) — 같이가개에서 예약하고 이용한 손님만 남기는 숙박 앱식 후기입니다.
//   · 예약 한 건에 한 개, 체크아웃 날부터(취소·거절·노쇼 예약은 못 씀)
//   · 전체 별점 + 청결·친절·반려동물 편의 별점(선택), 글 10~1000자
// 표는 scripts/sql/lodging-reviews.sql, 서버는 /api/lodging/reviews, 화면은 숙소 화면(/stay/번호)의 "숙박 후기".
// 장소 후기(reviews 표)와는 따로 셉니다.

export const REVIEW_TEXT_MIN = 10;
export const REVIEW_TEXT_MAX = 1000;
export const REVIEW_ASPECTS = [
  { id: "clean_rating", label: "청결" },
  { id: "service_rating", label: "친절" },
  { id: "pet_rating", label: "반려동물 편의" },
] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number]["id"];

export type StayReview = {
  id: number; room_name: string | null; guest_display_name: string | null; rating: number;
  clean_rating: number | null; service_rating: number | null; pet_rating: number | null;
  content: string; pets_summary: string | null; nights: number | null; owner_reply: string | null; created_at: string;
};
export type ReviewSummary = { count: number; average: number | null; aspects: Record<ReviewAspect, number | null>; stars: number[] };

const star = (v: unknown, required: boolean): number | null | "bad" => {
  if (v == null || v === "") return required ? "bad" : null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : "bad";
};

// ── 사장님 답글·신고 (scripts/sql/lodging-guest-review-reports.sql) ──
//   사장님은 후기마다 답글 하나(고치기·지우기 가능)를 달고, 문제 있는 후기를 신고할 수 있습니다.
//   신고는 관리자가 검토해 유지 / 가리기(블라인드) / 삭제하고, 필요하면 작성자의 숙박 후기 작성을 막습니다.
export const OWNER_REPLY_MAX = 1000;
export const REVIEW_REPORT_REASONS = [
  { id: "false", label: "사실과 다른 내용" },
  { id: "abuse", label: "욕설·비방·인신공격" },
  { id: "privacy", label: "개인정보 노출" },
  { id: "unrelated", label: "숙소와 관계없는 내용·광고" },
  { id: "extortion", label: "보상 요구·악의적 후기" },
  { id: "etc", label: "기타" },
] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number]["id"];
export type ReviewReportStatus = "pending" | "kept" | "hidden" | "deleted";
export const REVIEW_REPORT_STATUS: Record<ReviewReportStatus, string> = { pending: "검토 중", kept: "유지(문제 없음)", hidden: "가림 처리", deleted: "삭제" };
export const REVIEW_ADMIN_ACTIONS = ["keep", "hide", "delete"] as const;
export type ReviewAdminAction = (typeof REVIEW_ADMIN_ACTIONS)[number];

/** 사장님의 신고를 다듬습니다 — 사유 필수, "기타"는 설명 필수 */
export function cleanReviewReport(raw: unknown): { reason: ReviewReportReason; detail: string | null } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const reason = REVIEW_REPORT_REASONS.find((x) => x.id === r.reason)?.id;
  if (!reason) return { error: "신고 사유를 골라 주세요." };
  const detail = typeof r.detail === "string" && r.detail.trim() ? r.detail.trim().slice(0, 500) : null;
  if (reason === "etc" && !detail) return { error: "신고 사유를 적어 주세요." };
  return { reason, detail };
}

/** 손님이 보낸 후기를 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanReview(raw: unknown): { review: { bookingId: number; rating: number; content: string } & Record<ReviewAspect, number | null> } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bookingId = Number(r.bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return { error: "후기를 남길 예약을 찾을 수 없어요." };
  const rating = star(r.rating, true);
  if (rating === "bad" || rating == null) return { error: "별점을 골라 주세요." };
  const aspects = {} as Record<ReviewAspect, number | null>;
  for (const a of REVIEW_ASPECTS) {
    const v = star(r[a.id], false);
    if (v === "bad") return { error: `${a.label} 별점을 다시 골라 주세요.` };
    aspects[a.id] = v;
  }
  const content = typeof r.content === "string" ? r.content.trim().slice(0, REVIEW_TEXT_MAX) : "";
  if (content.length < REVIEW_TEXT_MIN) return { error: `후기를 ${REVIEW_TEXT_MIN}자 이상 적어 주세요.` };
  return { review: { bookingId, rating, content, ...aspects } };
}

/** 후기를 쓸 수 있는 예약인지 — 확정(또는 이용 완료)된 예약이고 체크아웃 날이 됐을 때 */
export function canReviewStay(b: { status: string; check_out: string }, today: string): boolean {
  return (b.status === "confirmed" || b.status === "completed") && b.check_out <= today;
}

/** "김보호" → "김*호", "이준" → "이*" */
export function maskName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "손님";
  if (n.length === 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

const avg = (values: (number | null)[]): number | null => {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/** 평균 별점(소수 한 자리)·항목별 평균·별점별 개수(5점부터) */
export function summarizeReviews(reviews: Pick<StayReview, "rating" | ReviewAspect>[]): ReviewSummary {
  const aspects = {} as Record<ReviewAspect, number | null>;
  for (const a of REVIEW_ASPECTS) aspects[a.id] = avg(reviews.map((r) => r[a.id]));
  return {
    count: reviews.length,
    average: avg(reviews.map((r) => r.rating)),
    aspects,
    stars: [5, 4, 3, 2, 1].map((s) => reviews.filter((r) => r.rating === s).length),
  };
}
