-- 사장님이 정하는 검색 해시태그(한 곳당 5개까지)와 주문 받는 방식(포장·매장 식사)
alter table public.places
  add column if not exists search_tags text[] not null default '{}',
  add column if not exists store_order_modes text[];

-- 사장님이 정하는 포장 주문 가능 시간(HH:MM, 비우면 제한 없음)
alter table public.places
  add column if not exists order_open_time text,
  add column if not exists order_close_time text;

-- 사장님이 오늘 주문을 마감한 날짜(한국 시간 YYYY-MM-DD). 날짜가 지나면 자동으로 풀립니다
alter table public.places
  add column if not exists orders_closed_on text;

-- 가게 안내(소개·알레르기·원산지·준비 시간·최소 주문·사업자 정보)와 상품의 알레르기 재료·옵션·사료 성분등록번호
alter table public.places
  add column if not exists store_info jsonb not null default '{}'::jsonb;
alter table public.owner_products
  add column if not exists allergens text[] not null default '{}',
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists feed_reg_no text;

-- 요일별 주문 시간, 가게 쿠폰, 후기 사진
alter table public.places add column if not exists order_week jsonb;
create table if not exists public.store_coupons (
  id bigserial primary key,
  place_id bigint not null references public.places(id) on delete cascade,
  name text not null,
  discount integer not null check (discount > 0),
  min_order integer not null default 0,
  expires_on text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists store_coupons_place on public.store_coupons(place_id);
alter table public.store_coupons enable row level security;
alter table public.place_reservations
  add column if not exists coupon_id bigint references public.store_coupons(id) on delete set null,
  add column if not exists discount integer not null default 0;
alter table public.store_reviews add column if not exists photos text[] not null default '{}';
