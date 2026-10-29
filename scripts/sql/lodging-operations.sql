-- ── 숙박 운영 보강 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. (lodging-bookings.sql, lodging-settlement.sql 다음에 실행)
--
-- 1) 손님 알림함(user_notifications): 예약 확정·거절·취소, 체크인 전날 안내, 체크아웃 후 후기 요청 등.
--    마이페이지 "알림"과 아래 탭바 빨간 숫자에 쓰고, 알림을 켜 둔 기기로도 보냅니다.
-- 2) 중복 예약 방지(iCal): 다른 예약 사이트(에어비앤비·부킹닷컴 등)의 객실 달력 주소를 넣으면
--    그쪽에서 팔린 날을 같이가개에서 자동으로 막고(lodging_ical_blocks), 같이가개 예약은 우리 달력 주소로 내보냅니다.
-- 3) 체크인 전날 안내·후기 요청을 한 번만 보내도록 표시(guest_reminded_at, review_requested_at)
-- 4) 관리자 환불 처리 기록(refund_done_at·refund_done_by) — 결제대행 연동 전에는 직접 돌려준 뒤 표시
-- 5) 관리자 숙소 입점 영업 리스트(lodging_leads) — 연락 상태·메모

create table if not exists user_notifications (
  id bigserial primary key,
  auth_user_id uuid not null,
  kind text not null,                    -- stay_confirmed | stay_declined | stay_cancelled | stay_reminder | stay_review …
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_notifications_user on user_notifications(auth_user_id, created_at desc);
alter table user_notifications enable row level security;

alter table lodging_rooms add column if not exists ical_import_url text;
alter table lodging_rooms add column if not exists ical_export_token text;
alter table lodging_rooms add column if not exists ical_synced_at timestamptz;
alter table lodging_rooms add column if not exists ical_error text;
create unique index if not exists idx_lodging_rooms_ical_token on lodging_rooms(ical_export_token) where ical_export_token is not null;

create table if not exists lodging_ical_blocks (
  room_id bigint not null,
  day date not null,
  summary text,
  synced_at timestamptz not null default now(),
  primary key (room_id, day)
);
alter table lodging_ical_blocks enable row level security;

alter table lodging_bookings add column if not exists guest_reminded_at timestamptz;
alter table lodging_bookings add column if not exists review_requested_at timestamptz;
alter table lodging_bookings add column if not exists refund_done_at timestamptz;
alter table lodging_bookings add column if not exists refund_done_by text;

create table if not exists lodging_leads (
  place_id bigint primary key,             -- 공공데이터 숙소 번호(또는 같이가개 장소 번호)
  status text not null default 'todo',     -- todo | contacted | interested | declined | joined
  memo text,
  contacted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table lodging_leads enable row level security;

-- 확인:
-- select count(*) from user_notifications;
-- select id, name, ical_import_url, ical_synced_at from lodging_rooms;
