-- ── 방문 체크인(방문 인증) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 사용자가 실제로 그 장소 근처(GPS 기준 150m 안)에 있을 때만 서버가 기록합니다.
-- 방문 인증한 사람의 후기에는 "방문 인증" 배지가 붙고, 장소별 방문 수는 사장님 통계·추천에 쓸 수 있습니다.
-- 위치 좌표 자체는 저장하지 않습니다(거리 확인에만 쓰고 버림) — 누가·어느 장소를·언제 방문했는지만 남깁니다.

create table if not exists place_checkins (
  id bigserial primary key,
  place_id bigint not null,          -- 직접 등록 장소와 공공데이터 장소(id 10억 이상) 모두
  auth_user_id uuid,                 -- 로그인 사용자
  user_key text,                     -- 비회원(브라우저에 저장된 익명 키)
  source text not null default 'manual' check (source in ('manual', 'walk')),  -- 직접 누름 | 산책 모드 자동 도착
  created_at timestamptz default now()
);
create index if not exists idx_place_checkins_place on place_checkins(place_id, created_at desc);
create index if not exists idx_place_checkins_user on place_checkins(auth_user_id) where auth_user_id is not null;

-- 브라우저에서 직접 읽거나 쓰지 못하게 막습니다(정책 없음 = 서버만 접근).
-- 기록은 서버 API(/api/checkin)가 거리를 확인한 뒤에만 합니다.
alter table place_checkins enable row level security;

-- ── 확인용 ──
-- select place_id, count(*) from place_checkins group by place_id order by 2 desc limit 10;
