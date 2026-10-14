-- scripts/sql/owner-store.sql
--
-- 사장님 요금제 단계(프리미엄 / 프리미엄 스토어 / 동네 대표)와 "상품 등록 · 예약 포장" 기능에 필요한 표.
-- Supabase SQL 편집기에서 한 번 실행하세요(여러 번 실행해도 안전합니다).
--
--   1) places.premium_plan      : 지금 이용 중인 요금제 단계('premium' | 'store' | 'local'). 비어 있으면 'premium'으로 봅니다.
--   2) owner_products           : 가게가 올린 상품(이름·설명·가격)
--   3) place_reservations       : 손님의 예약(포장) 요청과 처리 상태
--   4) premium_changes          : 관리자가 프리미엄 기간·요금제·혜택을 바꾼 기록(누가·언제·무엇을)
--   5) owner_push_subs          : 사장님 기기의 알림 수신 주소(새 예약 알림용)
--
-- ⚠ 표 모두 RLS를 켜고 정책을 만들지 않습니다 = 브라우저(anon/로그인 키)로는 읽지도 쓰지도 못합니다.
--   모든 읽기·쓰기는 우리 서버(/api/store, /api/owner/products, /api/owner/reservations)가 권한을 확인한 뒤 대신 합니다.
--   (예약에는 손님 이름·전화번호가 들어 있어서, 그 가게의 사장님과 예약한 본인만 볼 수 있어야 합니다.)

alter table public.places add column if not exists premium_plan text;

create table if not exists public.owner_products (
  id          bigserial primary key,
  place_id    bigint not null references public.places(id) on delete cascade,
  name        text not null,
  description text,
  price       integer not null check (price >= 0),
  is_active   boolean not null default true,        -- 꺼 두면 손님에게 보이지 않음(품절·잠시 중단)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists owner_products_place_idx on public.owner_products (place_id, sort_order, id);
alter table public.owner_products enable row level security;

create table if not exists public.place_reservations (
  id                    bigserial primary key,
  place_id              bigint not null references public.places(id) on delete cascade,
  customer_auth_user_id uuid not null,
  customer_name         text not null,
  customer_phone        text not null,
  items                 jsonb not null,             -- [{ productId, name, price, qty }] — 예약 당시의 이름·가격을 그대로 보관
  total                 integer not null check (total >= 0),
  pickup_at             timestamptz,                -- 가지러 갈 시각(손님이 고름)
  memo                  text,
  status                text not null default 'requested'
                        check (status in ('requested', 'accepted', 'ready', 'completed', 'rejected', 'cancelled')),
  owner_note            text,                       -- 사장님이 손님에게 남기는 말(거절 사유 등)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists place_reservations_place_idx on public.place_reservations (place_id, created_at desc);
create index if not exists place_reservations_customer_idx on public.place_reservations (customer_auth_user_id, created_at desc);
alter table public.place_reservations enable row level security;

create table if not exists public.premium_changes (
  id          bigserial primary key,
  place_id    bigint not null references public.places(id) on delete cascade,
  action      text not null,                        -- extend | shorten | end | plan | perks | approve
  detail      text,                                 -- 사람이 읽는 설명(예: "+7일 → 만료 2026-11-20")
  changed_by  text,                                 -- 바꾼 관리자
  created_at  timestamptz not null default now()
);
create index if not exists premium_changes_place_idx on public.premium_changes (place_id, created_at desc);
alter table public.premium_changes enable row level security;

create table if not exists public.owner_push_subs (
  endpoint     text primary key,                    -- 브라우저·앱이 발급한 알림 수신 주소(기기마다 고유)
  p256dh       text not null,
  auth         text not null,
  auth_user_id uuid not null,                       -- 사장님 계정
  place_id     bigint not null references public.places(id) on delete cascade,
  label        text,                                -- 기기 이름(안드로이드 · 크롬 등)
  created_at   timestamptz not null default now()
);
create index if not exists owner_push_subs_place_idx on public.owner_push_subs (place_id);
alter table public.owner_push_subs enable row level security;

notify pgrst, 'reload schema';
