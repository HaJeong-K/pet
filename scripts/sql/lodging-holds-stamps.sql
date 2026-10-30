-- 숙박 중복 예약 차단 + 기본 포함 마릿수 + 추억 스탬프
-- 여러 번 실행해도 안전합니다.

-- ① 기본 포함 마릿수 — 이 마릿수까지는 반려동물 추가 요금 없음(예: 1이면 둘째부터 요금)
alter table public.lodging_profiles add column if not exists pet_free_count integer;

-- ② 같은 객실·같은 날짜에 진행 중인 예약(확인 대기·확정)이 두 건 생기지 않게 DB에서 막습니다.
--    동시에 눌러도 한 건만 들어갑니다. 확인 대기는 24시간 동안 날짜를 잡아 둡니다.
create extension if not exists btree_gist;
alter table public.lodging_bookings drop constraint if exists lodging_bookings_no_overlap;
alter table public.lodging_bookings add constraint lodging_bookings_no_overlap
  exclude using gist (room_id with =, daterange(check_in, check_out, '[)') with &&)
  where (status in ('requested', 'confirmed'));

-- ③ 스탬프 할인액 — total은 손님이 내는 금액(할인 후). 할인분은 같이가개가 부담해서, 정산은 total + stamp_discount 기준입니다.
alter table public.lodging_bookings add column if not exists stamp_discount integer not null default 0;

-- ④ 추억 스탬프 — 한 줄이 스탬프 한 개. 예약에 쓰면 spent_booking_id가 채워지고, 예약이 취소되면 비워져 돌아옵니다.
--    위치(위도·경도)는 저장하지 않습니다. 인증할 때 장소와의 거리만 확인합니다.
create table if not exists public.memory_stamps (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('place', 'course', 'stay')),
  place_key text not null,          -- 장소 번호 / course:코스번호 / stay:예약번호
  title text not null,
  issued_on date not null,          -- 한국 날짜
  spent_booking_id bigint references public.lodging_bookings(id) on delete set null,
  spent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (auth_user_id, place_key, issued_on)
);
create index if not exists memory_stamps_user_idx on public.memory_stamps (auth_user_id, issued_on desc);
create index if not exists memory_stamps_booking_idx on public.memory_stamps (spent_booking_id) where spent_booking_id is not null;
alter table public.memory_stamps enable row level security; -- 정책 없음: 서버(/api/me/stamps)만 읽고 씁니다
