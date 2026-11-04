// src/lib/server/ownerResultNotify.ts
//
// 사장님 심사 결과 알림 — 사장님 인증, 숙소 입점, 쇼핑 입점을 관리자가 승인·반려하면 바로 알립니다.
// 마이페이지 알림함(탭바 "마이페이지" 빨간 숫자) + 알림을 켠 기기로 갑니다(src/lib/server/guestNotify.ts).
// 예전엔 결과를 사장님이 화면을 다시 열어야만 알 수 있었습니다. 실패해도 심사 처리는 막지 않습니다.

import { notifyGuest } from "@/lib/server/guestNotify";

type ReviewKind = "verify" | "lodging" | "store";

const NAME: Record<ReviewKind, string> = { verify: "사장님 인증", lodging: "숙소 입점", store: "쇼핑 입점" };
const APPROVED_BODY: Record<ReviewKind, string> = {
  verify: "이제 사장님 센터에서 가게 정보 관리·후기 답글·통계를 쓸 수 있어요.",
  lodging: "사장님 센터에서 객실과 요금을 등록하면 손님이 바로 예약할 수 있어요.",
  store: "사장님 센터에서 상품을 올리면 쇼핑 탭에서 주문을 받을 수 있어요.",
};

export async function notifyOwnerResult(authUserId: string | null | undefined, kind: ReviewKind, approved: boolean, note?: string | null): Promise<void> {
  if (!authUserId) return;
  await notifyGuest(authUserId, {
    kind: `owner_${kind}_${approved ? "approved" : "rejected"}`,
    title: approved ? `${NAME[kind]}이 승인됐어요` : `${NAME[kind]} 신청이 반려됐어요`,
    body: approved ? APPROVED_BODY[kind] : `사유: ${(note || "사장님 센터에서 확인해 주세요.").slice(0, 120)}`,
    url: "/owner",
  });
}
