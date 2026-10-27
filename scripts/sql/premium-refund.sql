-- ── 프리미엄 해지 환불 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. scripts/sql/premium-cancel.sql을 먼저 실행해 두어야 합니다.
--
-- 환불 규칙(src/lib/ownerPlans.ts의 refundFor):
--   · 결제일(관리자가 입금을 확인해 적용한 날)부터 3일 안에 해지 → 그 결제 금액 전액
--   · 그 뒤 → 남은 날만큼 일할(10원 미만 버림)
--   · 환불이 생기면 혜택은 해지한 날 바로 끝나고, 관리자가 입금 계좌로 돌려드린 뒤 "환불 완료"로 표시합니다.

-- 1) 신청 금액 — 신청할 때 계산한 금액을 남겨 두어 환불 계산에 씁니다(예전 신청은 비어 있어 다시 계산)
alter table public.premium_requests add column if not exists amount integer;

-- 2) 해지 기록에 환불 정보
alter table public.premium_cancellations add column if not exists refund_amount integer not null default 0;
alter table public.premium_cancellations add column if not exists refund_kind text not null default 'none';      -- none | full | prorated
alter table public.premium_cancellations add column if not exists refund_status text not null default 'none';  -- none | pending | done
alter table public.premium_cancellations add column if not exists refunded_at timestamptz;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select place_id, outcome, refund_kind, refund_amount, refund_status from premium_cancellations order by created_at desc;
