// src/lib/payments.ts
//
// 선결제 공통 값. 결제창 열기는 src/lib/startPayment.ts, 서버 쪽은 src/lib/server/payments.ts.

export type PaymentKind = "lodging" | "store";
/** 결제를 기다리며 날짜·주문을 잡아 두는 시간 */
export const PAYMENT_HOLD_MS = 20 * 60_000;
/** 토스 결제 최소 금액 */
export const PAYMENT_MIN_AMOUNT = 100;
/** 결제 키를 넣어 둔 환경인지(화면 문구용) */
export const paymentsReady = () => !!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
