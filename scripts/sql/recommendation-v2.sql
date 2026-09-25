-- ── 추천 시스템 v2: 노출/클릭 로깅 + A/B 그룹 기록 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
-- (analytics.sql을 먼저 실행해 analytics_events 테이블이 있어야 합니다)
--
-- variant : A/B 그룹 ('v1' = 기존 규칙, 'v2' = 신규 알고리즘)
-- meta    : 이벤트 부가 정보(JSON)
--           rec_impression → {"algo":"v2","items":[{"id":"123","pos":1,"score":87}, ...]}
--           rec_click      → {"algo":"v2","pos":3,"score":81}
--           course_*       → {"theme":"walk","stops":["1","park-9"],"km":2.4,"min":95}

alter table analytics_events add column if not exists variant text;
alter table analytics_events add column if not exists meta jsonb;

create index if not exists idx_analytics_events_type_created on analytics_events(event_type, created_at);
create index if not exists idx_analytics_events_variant on analytics_events(variant) where variant is not null;

-- 반응(찜/좋아요/싫어요) 시간 감쇠 계산에 created_at이 필요합니다. 기존 테이블에 이미
-- 있으면 아무 일도 일어나지 않습니다.
alter table reactions add column if not exists created_at timestamptz default now();
create index if not exists idx_reactions_user_key on reactions(user_key);
