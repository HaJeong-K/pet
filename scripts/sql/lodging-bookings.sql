-- ── 숙소 3단계: 예약 달력 + 예약 요청 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. scripts/sql/lodging.sql을 먼저 실행해 두어야 합니다.
--
-- · 예약 달력: 숙소 사장님이 객실마다 "예약 막는 날"과 "날짜별 요금(성수기·연휴)"을 정합니다.
-- · 예약 요청: 손님이 날짜·인원·반려동물 정보를 보내면 사장님이 확정하거나 거절합니다. 결제는 숙소에서 직접(현장 결제).
-- 규칙은 src/lib/lodgingBooking.ts, 서버는 /api/owner/lodging/calendar · /api/owner/lodging/bookings · /api/lodging/*.
-- 두 표 모두 RLS를 켜고 정책을 두지 않습니다 — 모든 읽기·쓰기는 서버(service role)를 거칩니다.

-- 1) 객실 달력 — 기본은 "예약 가능 + 평일/주말 요금"이고, 사장님이 바꾼 날만 줄이 생깁니다
create table if not exists lodging_room_days (
  room_id bigint not null references lodging_rooms(id) on delete cascade,
  day date not null,
  closed boolean not null default false,           -- 예약 막는 날
  price int,                                       -- 이 날 1박 요금(없으면 평일/주말 요금)
  updated_at timestamptz not null default now(),
  primary key (room_id, day)
);
alter table lodging_room_days enable row level security;

-- 2) 숙박 예약
create table if not exists lodging_bookings (
  id bigserial primary key,
  place_id bigint not null,
  room_id bigint not null references lodging_rooms(id) on delete restrict,
  room_name text not null,                         -- 예약 당시 객실 이름(객실 이름이 바뀌어도 기록 유지)
  guest_auth_user_id uuid not null,
  guest_name text not null,
  guest_phone text not null,
  check_in date not null,
  check_out date not null,
  nights int not null,
  guests int not null,
  pets jsonb not null default '[]',                -- [{ species, size, weight, name }]
  price_detail jsonb not null default '{}',        -- { nights: [{ day, price }], roomTotal, extraGuestTotal, petTotal }
  total int not null,                              -- 예상 결제 금액(숙소에서 결제)
  payment text not null default 'onsite',          -- onsite(현장 결제) | online(온라인 결제 — PG 연동 후)
  memo text,                                       -- 손님 요청 사항
  status text not null default 'requested',        -- requested | confirmed | declined | cancelled_by_guest | cancelled_by_owner | completed | no_show
  owner_note text,                                 -- 사장님이 손님에게 남기는 말(거절 이유 등)
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lodging_bookings_place on lodging_bookings(place_id, created_at desc);
create index if not exists idx_lodging_bookings_room_dates on lodging_bookings(room_id, check_in, check_out) where status in ('requested', 'confirmed');
create index if not exists idx_lodging_bookings_guest on lodging_bookings(guest_auth_user_id, created_at desc);
alter table lodging_bookings enable row level security;

-- ── 확인용 ──
-- select status, count(*) from lodging_bookings group by 1;
