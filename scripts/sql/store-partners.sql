-- 쇼핑 입점 상담 + 포장 주문·매장 식사 예약 + 선결제 준비
-- 여러 번 실행해도 안전합니다. 서버(/api/owner/store-partner, /api/admin/store-partners)만 읽고 씁니다.

-- ① 입점 상담 — 가입한 사장님이면 누구나 신청. 관리자가 상담 후 승인하면 쇼핑 탭과 장소 상세에 열립니다.
create table if not exists public.store_partners (
  id bigint generated always as identity primary key,
  owner_auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_place_id bigint,                  -- 고른 가게(직접 등록 장소 또는 공공데이터 장소 번호)
  place_name text not null,
  place_address text,
  place_phone text,
  order_modes text[] not null default '{pickup}',  -- pickup(포장) · dine_in(매장 식사)
  message text,
  status text not null default 'pending' check (status in ('pending', 'consulting', 'approved', 'rejected')),
  linked_place_id bigint,                     -- 승인 후 연결된 같이가개 장소 번호
  partner_since date,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists store_partners_status_idx on public.store_partners (status, created_at);
create index if not exists store_partners_place_idx on public.store_partners (linked_place_id) where status = 'approved';
alter table public.store_partners enable row level security;

-- ② 주문 방식 · 인원 · 결제 상태(선결제). 결제대행 연동 전에는 payment_status = 'unpaid'로 남습니다.
alter table public.place_reservations add column if not exists order_type text not null default 'pickup';
alter table public.place_reservations add column if not exists party_size integer;
alter table public.place_reservations add column if not exists payment_status text not null default 'unpaid';
alter table public.place_reservations add column if not exists paid_at timestamptz;
alter table public.place_reservations add column if not exists refund_amount integer;
alter table public.place_reservations drop constraint if exists place_reservations_order_type_check;
alter table public.place_reservations add constraint place_reservations_order_type_check check (order_type in ('pickup', 'dine_in'));

-- ③ 노쇼 상태 — 미리 결제한 주문을 찾으러 오지 않은 경우
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.place_reservations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%requested%';
  if c is not null then execute format('alter table public.place_reservations drop constraint %I', c); end if;
end $$;
alter table public.place_reservations add constraint place_reservations_status_check
  check (status in ('requested', 'accepted', 'ready', 'completed', 'rejected', 'cancelled', 'no_show'));

notify pgrst, 'reload schema';
