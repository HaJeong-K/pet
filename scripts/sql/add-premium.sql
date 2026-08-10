-- ── 사장님 프리미엄 등록 모델 ──
-- Supabase SQL 편집기에서 실행하세요.
--
-- 결제대행(PG) 연동 전이라, 지금 단계에서는 "무통장입금 등 오프라인 결제 확인 후
-- 관리자가 수동 승인"하는 방식으로 운영합니다(사업자등록·PG 심사는 별도로 진행 중이라
-- 이번 단계에서는 자동 결제를 만들지 않습니다). 사장님이 신청하면 premium_requests에
-- pending 행이 생기고, 관리자가 입금을 확인한 뒤 승인하면 해당 장소의 places.is_premium이
-- true가 되고 premium_expires_at이 채워집니다.

-- 1) places 테이블에 프리미엄 상태 컬럼 추가
alter table public.places add column if not exists is_premium boolean not null default false;
alter table public.places add column if not exists premium_expires_at timestamptz;

-- 프리미엄 장소를 빠르게 조회하기 위한 인덱스(SideAdRail·추천점수 계산에서 사용)
create index if not exists idx_places_is_premium on public.places (is_premium) where is_premium = true;

-- 2) 프리미엄 신청 내역 테이블
create table if not exists public.premium_requests (
  id bigint generated always as identity primary key,
  place_id bigint not null references public.places(id) on delete cascade,
  owner_auth_user_id uuid not null,
  plan text not null default 'basic',           -- 향후 요금제가 여러 개로 늘어날 것을 대비한 자리(현재는 'basic' 단일)
  months integer not null default 1,             -- 신청한 개월 수
  payer_name text,                               -- 무통장입금 입금자명(대조용)
  memo text,                                     -- 사장님이 남긴 메모(선택)
  status text not null default 'pending',        -- pending | approved | rejected
  admin_note text,                               -- 관리자가 남기는 승인/거절 사유
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text                              -- 처리한 관리자 이메일
);

create index if not exists idx_premium_requests_status on public.premium_requests (status);
create index if not exists idx_premium_requests_place_id on public.premium_requests (place_id);

-- ⚠ RLS: 쓰기(신청/승인/거절)는 항상 서비스 롤 API 라우트(/api/owner/apply-premium,
-- /api/admin/premium)를 거치므로 클라이언트가 직접 insert/update할 수 없습니다.
-- 읽기는 마이페이지(사장님 본인 신청 현황)와 관리자 프리미엄 페이지 둘 다 클라이언트에서
-- 직접 select하는 구조라(admin/tips가 proposals를 직접 읽는 것과 동일한 패턴) select만
-- 열어둡니다 — payer_name/memo가 담기지만 결제 비밀번호·카드번호 등 민감정보는 아닙니다.
alter table public.premium_requests enable row level security;

drop policy if exists "premium_requests_select_all" on public.premium_requests;
create policy "premium_requests_select_all"
  on public.premium_requests for select
  using (true);
