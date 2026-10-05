// src/lib/postReview.ts
//
// 커뮤니티 글 자동 검토(게시판 규칙 위반 의심 글을 관리자 확인 전까지 보류) — 화면에서 쓰는 도우미.
// 판정은 DB 트리거가 합니다(scripts/sql/post-review.sql). 여기서는 결과를 읽어 안내하고 관리자에게 알립니다.
// SQL을 아직 실행하지 않은 환경에서는 review_status 값이 없으므로 모두 "공개"로 취급합니다.

export type ReviewStatus = "visible" | "pending" | "rejected";

export const reviewStatusOf = (post: { review_status?: string | null } | null | undefined): ReviewStatus =>
  post?.review_status === "pending" || post?.review_status === "rejected" ? post.review_status : "visible";

/** 검토 대기로 저장된 글을 관리자에게 알립니다(실패해도 글은 검토 목록에 남으므로 조용히 넘어감). */
export function notifyPostReview(postId: number | string): void {
  fetch("/api/community/review-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
    keepalive: true,
  }).catch(() => {});
}

export const HELD_MESSAGE =
  "글이 저장됐지만 바로 공개되지는 않았어요.\n게시판 이용 안내와 맞지 않을 수 있는 표현이 있어 관리자가 확인한 뒤 게시돼요.\n(마이페이지 > 작성한 글에서 상태를 볼 수 있어요)";
