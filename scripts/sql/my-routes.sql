-- ── 내 경로(직접 만드는 여행 경로) — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. scripts/sql/saved-courses.sql을 먼저 실행해 두어야 합니다.
--
-- 장소 상세의 "내 경로에 추가"로 장소를 담고, 마이페이지 "코스·내 경로"에서 순서를 바꿉니다(src/lib/myRoutes.ts).
-- AI 코스와 같은 saved_courses 표를 쓰고 theme = 'custom'으로 구분합니다.
-- 순서를 바꾸려면 수정 권한이 필요해서, 본인 것만 고칠 수 있는 수정 정책을 더합니다.

drop policy if exists "saved_courses_update_own" on saved_courses;
create policy "saved_courses_update_own" on saved_courses
  for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);

create index if not exists idx_saved_courses_user_theme on saved_courses(auth_user_id, theme);

-- ── 확인용 ──
-- select theme, count(*) from saved_courses group by 1;
