-- ── 숙박 예약 이용자 정보·동의 기록 + 숙박 후기 신고·제재 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. (lodging-bookings.sql, lodging-reviews.sql 다음에 실행)
--
-- 1) 예약할 때 받는 정보(다른 숙박 예약 앱과 같은 항목)
--    · 예약자: 이름·휴대전화(필수, 원래 있던 칸)·이메일(선택)
--    · 실제 이용자(투숙 대표자): 예약자와 다르면 이름·휴대전화(필수)
--    · 방문 수단(도보/차량, 필수)·도착 예정 시각(선택)
--    · 동의 기록: 이용 규칙·취소 환불 / 개인정보 수집·이용 / 숙소에 개인정보 제공 / 만 14세 이상 — 판(버전)과 시각
-- 2) 숙박 후기 신고: 숙소 사장님이 후기를 신고하면 관리자가 검토해 유지·가리기·삭제하고,
--    필요하면 작성자의 숙박 후기 작성을 막습니다(lodging_review_bans).

alter table lodging_bookings add column if not exists guest_email text;
alter table lodging_bookings add column if not exists stay_guest_name text;      -- 예약자와 같으면 비워 둠
alter table lodging_bookings add column if not exists stay_guest_phone text;
alter table lodging_bookings add column if not exists arrival_method text;       -- walk | car
alter table lodging_bookings add column if not exists arrival_time text;         -- "15:00" 같은 도착 예정 시각
alter table lodging_bookings add column if not exists consents jsonb;            -- {version, at, items: [...]}

alter table lodging_reviews add column if not exists report_status text;         -- null | pending | kept | hidden | deleted
alter table lodging_reviews add column if not exists report_reason text;         -- 신고 사유 종류
alter table lodging_reviews add column if not exists report_detail text;         -- 사장님이 적은 설명
alter table lodging_reviews add column if not exists reported_at timestamptz;
alter table lodging_reviews add column if not exists report_decided_at timestamptz;
alter table lodging_reviews add column if not exists report_admin_note text;
alter table lodging_reviews add column if not exists deleted_at timestamptz;     -- 삭제(기록은 남김)
create index if not exists idx_lodging_reviews_reports on lodging_reviews(reported_at desc) where report_status = 'pending';

create table if not exists lodging_review_bans (
  auth_user_id uuid primary key,
  reason text,
  review_id bigint,
  created_at timestamptz not null default now()
);
alter table lodging_review_bans enable row level security;

-- 확인:
-- select column_name from information_schema.columns where table_name = 'lodging_bookings' and column_name in ('guest_email', 'stay_guest_name', 'arrival_method', 'consents');
-- select count(*) from lodging_reviews where report_status = 'pending';
