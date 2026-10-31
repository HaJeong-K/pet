-- 숙박 결제 수단과 현금영수증 신청 기록. 여러 번 실행해도 안전합니다.
--   payment_method: card | transfer
--   cash_receipt: { type: income | expense | none, number, status: requested | issued | not_requested, issued_at }
alter table public.lodging_bookings add column if not exists payment_method text;
alter table public.lodging_bookings add column if not exists cash_receipt jsonb;
