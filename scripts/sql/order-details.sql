-- 주문·예약 상세 내역(2026-11-04)
-- · payments.detail: 카드사·카드 번호(가려진 것)·승인 번호·할부·간편결제 등 토스 승인 결과 요약 — 손님 상세 화면에 보여 줍니다
-- · payments.refunded_at: 마지막 환불 시각
-- · place_reservations: 가게가 주문을 수락·준비 완료·이용 완료·취소한 시각 — 진행 단계에 시간을 함께 보여 줍니다
alter table public.payments add column if not exists detail jsonb;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.place_reservations add column if not exists accepted_at timestamptz;
alter table public.place_reservations add column if not exists ready_at timestamptz;
alter table public.place_reservations add column if not exists completed_at timestamptz;
alter table public.place_reservations add column if not exists cancelled_at timestamptz;
