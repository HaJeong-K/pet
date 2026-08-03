-- ── 관리자 통계 분석 탭(/admin/analytics) 이벤트 로그 테이블 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.

create table if not exists analytics_events (
  id bigserial primary key,
  event_type text not null,       -- 'page_view' | 'search' | 'place_view'
  user_key text,
  auth_user_id uuid,
  path text,
  query text,
  place_id text,
  place_name text,
  region text,                    -- 시/도 단위 (예: "경남")
  sub_region text,                -- 시/군/구 단위 (예: "거창군") — 지역별 인기 장소 드릴다운용
  created_at timestamptz default now()
);

alter table analytics_events add column if not exists sub_region text;

create index if not exists idx_analytics_events_created on analytics_events(created_at);
create index if not exists idx_analytics_events_type on analytics_events(event_type);
create index if not exists idx_analytics_events_region on analytics_events(region, sub_region);
