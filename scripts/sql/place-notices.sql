-- ── 가게 공지(사장님 소식) — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다.
--
-- 네이버 플레이스의 "알림/소식"처럼, 인증된 사장님이 자기 가게 상세 화면에 공지를 올립니다.
--   · 장소 상세(지도 위 상세 창 포함)의 친화도 점수 바로 아래에 최신 공지 한 줄 → 누르면 지난 공지까지 모두
--   · 대표 공지(고정)는 한 가게에 하나 — 새로 고정하면 예전 고정은 풀립니다
--   · 지운 공지도 기록은 남깁니다(deleted_at) — 손님에게는 안 보입니다
-- 서버는 /api/place-notices(손님용 읽기), /api/owner/notices(사장님 쓰기). 브라우저가 직접 읽지 못하게 정책을 두지 않습니다.

create table if not exists place_notices (
  id bigserial primary key,
  place_id bigint not null,
  author_auth_user_id uuid not null,
  title text not null,
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_place_notices_place on place_notices(place_id, created_at desc) where deleted_at is null;
alter table place_notices enable row level security;

-- 확인:
-- select place_id, title, pinned, created_at from place_notices where deleted_at is null order by created_at desc limit 20;
