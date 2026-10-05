-- ── 저장한 코스(AI 추천 코스 보관함) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 로그인한 회원이 AI 추천 코스를 저장해 두고 마이페이지 "저장한 코스"에서 다시 봅니다.
-- 코스의 정거장(장소 번호·이름·좌표·종류)을 그 시점 그대로 stops에 담아 둡니다 — 나중에 장소 정보가
-- 바뀌거나 추천 결과가 달라져도, 저장한 코스는 저장했을 때 모습 그대로 남습니다.

create table if not exists saved_courses (
  id bigserial primary key,
  auth_user_id uuid not null default auth.uid(),
  title text not null,
  theme text,                      -- walk | tour | indoor
  stops jsonb not null,            -- [{ id, name, lat, lng, category, address, role }]
  total_distance_km numeric,
  estimated_minutes integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_courses_user on saved_courses(auth_user_id, created_at desc);

-- 본인 것만 보고·저장하고·지울 수 있습니다.
alter table saved_courses enable row level security;

drop policy if exists "saved_courses_select_own" on saved_courses;
create policy "saved_courses_select_own" on saved_courses
  for select using (auth.uid() = auth_user_id);

drop policy if exists "saved_courses_insert_own" on saved_courses;
create policy "saved_courses_insert_own" on saved_courses
  for insert with check (auth.uid() = auth_user_id);

drop policy if exists "saved_courses_delete_own" on saved_courses;
create policy "saved_courses_delete_own" on saved_courses
  for delete using (auth.uid() = auth_user_id);

-- ── 확인용 ──
-- select count(*) from saved_courses;
