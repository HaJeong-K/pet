-- ── 프리미엄 해지 + 해지 방어(시크릿 프라이스) — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. scripts/sql/premium-perks.sql을 먼저 실행해 두어야 합니다(할인을 거기에 적습니다).
--
-- 사장님 센터 "광고 상품"의 [해지하기] → "정말 해지할까요?" → (처음 한 번만) "시크릿 프라이스: 다음 30일 30% 할인"
--   · 할인을 받으면: premium_perks에 30% · 1개월 할인이 적히고, 다음 연장 신청 금액에 자동으로 반영됩니다(기능은 그대로).
--   · 그래도 해지하면: 남은 기간까지 이용하고 끝납니다. 처리 대기 중인 연장 신청은 취소됩니다.
--     남은 기간 요금의 환불 여부는 관리자가 확인해 따로 안내합니다.
-- 규칙은 src/lib/ownerPlans.ts(RETENTION_DISCOUNT_*), 서버는 /api/owner/premium-cancel.

-- 1) 해지·해지 방어 기록
create table if not exists public.premium_cancellations (
  id bigint generated always as identity primary key,
  place_id bigint not null,
  owner_auth_user_id uuid not null,
  plan text,                                       -- 해지 당시 요금제 단계
  outcome text not null,                           -- 'retained'(할인 받고 계속 이용) | 'cancelled'(해지)
  reason text,                                     -- 해지 이유(선택)
  offer_percent integer not null default 0,        -- 제안한 할인율(시크릿 프라이스를 보여 주지 않았으면 0)
  expires_at timestamptz,                          -- 해지 당시 이용 만료일(이 날까지 이용 후 종료)
  created_at timestamptz not null default now()
);
create index if not exists idx_premium_cancellations_place on public.premium_cancellations(place_id, created_at desc);
-- 브라우저에서 직접 읽거나 고치지 못하게 막습니다(정책 없음 = 서버만 접근).
alter table public.premium_cancellations enable row level security;

-- 2) 신청 건에 적용된 추가 할인율 — 관리자 프리미엄 화면에서 입금액을 맞춰 볼 때 씁니다
alter table public.premium_requests add column if not exists discount_percent integer not null default 0;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select outcome, count(*) from premium_cancellations group by 1;
