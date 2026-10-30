-- 선결제(토스페이먼츠) + 쇼핑 주문 취소 요청 + 쇼핑 후기
-- 여러 번 실행해도 안전합니다.

-- ① 결제 기록 — 결제 시도 한 번이 한 줄. 예약·주문(kind + ref_id)에는 여러 번 시도할 수 있고, 성공한 줄은 하나뿐입니다.
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  order_id text not null unique,          -- 토스에 보내는 주문번호
  kind text not null check (kind in ('lodging', 'store')),
  ref_id bigint not null,                 -- lodging_bookings.id 또는 place_reservations.id
  auth_user_id uuid not null,
  order_name text not null,
  amount integer not null check (amount > 0),
  status text not null default 'ready' check (status in ('ready', 'paid', 'partial_refunded', 'refunded', 'failed')),
  payment_key text unique,
  method text,                            -- 카드·간편결제 등
  receipt_url text,
  refunded_amount integer not null default 0,
  paid_at timestamptz,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_ref_idx on public.payments (kind, ref_id);
create unique index if not exists payments_one_success on public.payments (kind, ref_id) where status in ('paid', 'partial_refunded', 'refunded');
alter table public.payments enable row level security; -- 정책 없음: 서버만 읽고 씁니다

-- ② 숙박: 결제를 기다리는 동안에도 날짜를 잡아 둡니다(20분 안에 결제하지 않으면 풀림)
alter table public.lodging_bookings drop constraint if exists lodging_bookings_no_overlap;
alter table public.lodging_bookings add constraint lodging_bookings_no_overlap
  exclude using gist (room_id with =, daterange(check_in, check_out, '[)') with &&)
  where (status in ('pending_payment', 'requested', 'confirmed'));

-- ③ 쇼핑 주문: 결제 대기 상태, 환불 기록, 확정 뒤 취소 요청
alter table public.place_reservations drop constraint if exists place_reservations_status_check;
alter table public.place_reservations add constraint place_reservations_status_check
  check (status in ('pending_payment', 'requested', 'accepted', 'ready', 'completed', 'rejected', 'cancelled', 'no_show'));
alter table public.place_reservations add column if not exists refund_done_at timestamptz;
alter table public.place_reservations add column if not exists cancel_request_status text not null default 'none';
alter table public.place_reservations add column if not exists cancel_request_reason text;
alter table public.place_reservations add column if not exists cancel_requested_at timestamptz;
alter table public.place_reservations add column if not exists cancel_request_answer text;
alter table public.place_reservations drop constraint if exists place_reservations_cancel_request_check;
alter table public.place_reservations add constraint place_reservations_cancel_request_check
  check (cancel_request_status in ('none', 'open', 'denied', 'approved'));

-- ④ 쇼핑 후기 — 이용 완료한 주문 한 건에 후기 한 개
create table if not exists public.store_reviews (
  id bigint generated always as identity primary key,
  reservation_id bigint not null unique references public.place_reservations(id) on delete cascade,
  place_id bigint not null,
  auth_user_id uuid not null,
  display_name text,                      -- 화면에 보일 이름(예: 김*수)
  order_type text,
  rating smallint not null check (rating between 1 and 5),
  content text not null,
  owner_reply text,
  owner_reply_at timestamptz,
  reported_at timestamptz,                -- 사장님 신고
  report_reason text,
  hidden boolean not null default false,  -- 관리자가 가림
  created_at timestamptz not null default now()
);
create index if not exists store_reviews_place_idx on public.store_reviews (place_id, created_at desc);
alter table public.store_reviews enable row level security; -- 정책 없음: 서버만 읽고 씁니다
