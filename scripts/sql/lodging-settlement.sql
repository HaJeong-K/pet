-- ── 숙소 4단계: 결제·취소 환불·이용 확정·문제 접수·정산 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. scripts/sql/lodging-bookings.sql을 먼저 실행해 두어야 합니다.
--
-- 「같이가개 숙소 입점 계약서」 제8~21조를 따릅니다. 규칙은 src/lib/lodgingPolicy.ts.
--   · 결제: 손님이 예약할 때 전액 결제(결제대행 연동 전에는 payment_status = 'unpaid'로 남고, 관리자가 확인)
--   · 이용 확정: 체크아웃 날부터 손님이 누르거나, 3일 지나면 자동(매일 새벽 작업)
--   · 문제 있어요: 확정 전 접수하면 확정·정산을 멈추고 관리자가 판단
--   · 정산: 확정 다음 영업일. 위약금은 원래 체크아웃 다음 영업일, 취소 정산 수수료 15%

-- 1) 숙소별 성수기 기간(없으면 기준의 기본값 7/15~8/24, 12/20~2/20)과 즉시 확정
alter table lodging_profiles add column if not exists peak_periods jsonb not null default '[]';   -- [{ "from": "07-15", "to": "08-24" }]
alter table lodging_profiles add column if not exists instant_confirm boolean not null default false;

-- 2) 예약의 돈 흐름
alter table lodging_bookings add column if not exists booked_on date;                              -- 예약한 날(한국 날짜) — 당일 취소 전액 판단
alter table lodging_bookings add column if not exists payment_status text not null default 'unpaid'; -- unpaid | paid | refunded | partially_refunded
alter table lodging_bookings add column if not exists paid_at timestamptz;
alter table lodging_bookings add column if not exists cancel_cause text;                           -- guest | guest_pet_mismatch | owner | owner_pet_refused | force_majeure | not_confirmed
alter table lodging_bookings add column if not exists cancelled_at timestamptz;
alter table lodging_bookings add column if not exists refund_amount int not null default 0;        -- 손님에게 돌려준(줄) 금액
alter table lodging_bookings add column if not exists penalty_amount int not null default 0;       -- 위약금(숙소 몫)
alter table lodging_bookings add column if not exists compensation_amount int;                     -- 숙소 사정 취소 배상금(null = 관리자 확인 필요)

-- 3) 이용 확정 · 문제 접수
alter table lodging_bookings add column if not exists stay_confirmed_at timestamptz;
alter table lodging_bookings add column if not exists stay_confirmed_by text;                      -- guest | auto | admin
alter table lodging_bookings add column if not exists issue_status text not null default 'none';   -- none | open | resolved
alter table lodging_bookings add column if not exists issue_kind text;                             -- refused | different_room | pet_condition | facility | other
alter table lodging_bookings add column if not exists issue_detail text;
alter table lodging_bookings add column if not exists issue_opened_at timestamptz;
alter table lodging_bookings add column if not exists issue_owner_reply text;
alter table lodging_bookings add column if not exists issue_resolution text;                       -- 관리자 판단 내용

-- 4) 정산
alter table lodging_bookings add column if not exists fee_rate numeric(5,2);                       -- 적용 수수료율(%)
alter table lodging_bookings add column if not exists fee_amount int;
alter table lodging_bookings add column if not exists payout_amount int;                           -- 숙소에 보낼 금액
alter table lodging_bookings add column if not exists payout_due_on date;                          -- 정산 예정일
alter table lodging_bookings add column if not exists payout_status text not null default 'none';  -- none | scheduled | held | paid
alter table lodging_bookings add column if not exists paid_out_at timestamptz;

create index if not exists idx_lodging_bookings_confirm on lodging_bookings(check_out) where status = 'confirmed' and stay_confirmed_at is null;
create index if not exists idx_lodging_bookings_payout on lodging_bookings(payout_due_on) where payout_status = 'scheduled';
create index if not exists idx_lodging_bookings_issue on lodging_bookings(issue_opened_at) where issue_status = 'open';

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select status, payment_status, payout_status, issue_status, count(*) from lodging_bookings group by 1, 2, 3, 4;
