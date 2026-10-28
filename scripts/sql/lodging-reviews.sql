-- ── 숙박 후기(별점) + 그 외 동반 동물 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다.
--
-- 1) 숙박 후기: 같이가개에서 예약하고 실제로 묵은 손님만 남길 수 있는 숙박 앱식 별점 후기입니다.
--    · 예약 한 건에 후기 한 개(booking_id unique). 체크아웃 날부터 쓸 수 있습니다.
--    · 전체 별점(1~5) + 청결·친절·반려동물 편의 별점, 글(10~1000자), 사장님 답글
--    · 장소 후기(reviews 표)와는 따로입니다 — 숙소 화면(/stay/번호)의 "숙박 후기"에 보입니다.
-- 2) 그 외 동반 동물: 숙소가 강아지·고양이 말고 받는 동물(예: 토끼·햄스터)을 적는 칸입니다.
-- 서버는 /api/lodging/reviews. 브라우저가 직접 읽지 못하게 정책을 두지 않습니다.

create table if not exists lodging_reviews (
  id bigserial primary key,
  booking_id bigint not null unique,
  place_id bigint not null,
  room_name text,
  guest_auth_user_id uuid not null,
  guest_display_name text,                         -- 화면에 보일 이름(예: 김*수)
  rating smallint not null check (rating between 1 and 5),
  clean_rating smallint check (clean_rating between 1 and 5),
  service_rating smallint check (service_rating between 1 and 5),
  pet_rating smallint check (pet_rating between 1 and 5),
  content text not null,
  pets_summary text,                               -- 예: "강아지 소형견 1마리"
  nights int,
  owner_reply text,
  owner_replied_at timestamptz,
  hidden boolean not null default false,           -- 관리자가 가린 후기
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lodging_reviews_place on lodging_reviews(place_id, created_at desc) where hidden = false;
alter table lodging_reviews enable row level security;

alter table lodging_profiles add column if not exists pet_others text;

-- 확인:
-- select count(*) from lodging_reviews;
-- select column_name from information_schema.columns where table_name = 'lodging_profiles' and column_name = 'pet_others';
