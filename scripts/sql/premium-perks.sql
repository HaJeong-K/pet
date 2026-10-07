-- ── 프리미엄 가게별 추가 혜택(관리자 설정) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 관리자 "프리미엄" 화면의 "이용 중 가게" 탭에서 가게마다 따로 주는 혜택을 기록합니다.
--   · 배너 광고 추가 제공(기한 선택)
--   · 할인(몇 % 를 몇 달 동안)
--   · 무료로 연장해 준 누적 개월 수(연장 버튼을 누르면 자동으로 쌓임)
--   · 관리자 메모(왜 줬는지 등)
-- 프리미엄 기간 자체(시작·만료)는 예전처럼 places.is_premium / premium_expires_at 에 있습니다.

create table if not exists public.premium_perks (
  place_id bigint primary key references public.places(id) on delete cascade,
  banner_ad boolean not null default false,          -- 배너 광고 추가 제공 여부
  banner_until timestamptz,                          -- 배너 제공 기한(비우면 프리미엄 기간 동안)
  discount_percent integer not null default 0,       -- 할인율(0~100)
  discount_months integer not null default 0,        -- 할인을 적용할 개월 수
  free_months_granted integer not null default 0,    -- 관리자가 무료로 연장해 준 누적 개월 수
  memo text,                                         -- 관리자 메모
  updated_at timestamptz not null default now(),
  updated_by text                                    -- 마지막으로 고친 관리자
);
do $$ begin
  alter table public.premium_perks add constraint premium_perks_discount_check check (discount_percent between 0 and 100 and discount_months >= 0 and free_months_granted >= 0);
exception when duplicate_object then null; end $$;

-- 브라우저에서 직접 읽거나 고치지 못하게 막습니다(정책 없음 = 서버만 접근). 관리자 화면은 서버 API를 거칩니다.
alter table public.premium_perks enable row level security;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select * from premium_perks;
