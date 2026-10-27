-- ── 숙소(반려동물 동반 숙박) 2단계: 숙소 기본 정보·동반 규정 + 객실 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다.
--
-- 숙소 사장님(users.owner_kind = 'lodging', scripts/sql/owner-kind.sql)이 사장님 센터의 "숙소·객실" 메뉴에서 관리합니다.
-- 규칙(글자 수·다듬기)은 src/lib/lodgingRules.ts, 서버는 /api/owner/lodging, 손님용 읽기는 /api/lodging.
-- 두 표 모두 RLS를 켜고 정책을 두지 않습니다 — 모든 읽기·쓰기는 서버(service role)를 거칩니다(owner_products와 같은 방식).
-- place_id는 사용자 등록 장소와 공공데이터 장소(관광공사·문화정보원 번호)를 모두 쓰므로 places 외래키를 걸지 않습니다.

-- 1) 숙소 기본 정보·반려동물 동반 규정 (숙소 1곳당 1줄)
create table if not exists lodging_profiles (
  place_id bigint primary key,
  check_in text,                                   -- "15:00"
  check_out text,                                  -- "11:00"
  pet_species text[] not null default '{dog}',     -- dog | cat
  pet_sizes text[] not null default '{small}',     -- small | medium | large
  max_pet_weight_kg numeric(5,1),                  -- 한 마리 최대 몸무게
  max_pets int,                                    -- 한 객실 최대 마릿수(객실마다 따로 정할 수 있음)
  pet_fee int,                                     -- 1마리·1박 추가 요금(0 = 무료)
  pet_fee_note text,
  pet_amenities text[] not null default '{}',
  pet_rules text,                                  -- 반려동물 동반 수칙
  stay_rules text,                                 -- 숙소 이용 수칙
  refund_policy text,                              -- 취소·환불 규정
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table lodging_profiles enable row level security;

-- 2) 객실
create table if not exists lodging_rooms (
  id bigserial primary key,
  place_id bigint not null,
  name text not null,
  room_type text,                                  -- 원룸·독채·복층 등
  description text,
  base_price int not null default 0,               -- 1박(일~목)
  weekend_price int,                               -- 1박(금·토), 없으면 평일 요금
  std_guests int not null default 2,               -- 기준 인원
  max_guests int not null default 2,               -- 최대 인원
  extra_guest_fee int,                             -- 기준 초과 1명당 1박 추가 요금
  max_pets int,                                    -- 이 객실 최대 마릿수(없으면 숙소 기본 규정)
  images text[] not null default '{}',             -- lodging-images 보관함 주소(최대 6장)
  amenities text[] not null default '{}',
  is_active boolean not null default true,         -- 꺼 두면 손님에게 숨김
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lodging_rooms_place on lodging_rooms(place_id, sort_order);
alter table lodging_rooms enable row level security;

-- ── 확인용 ──
-- select count(*) from lodging_profiles;
-- select place_id, count(*) from lodging_rooms group by 1;
