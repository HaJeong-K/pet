-- 장소 후기·답글의 비회원 비밀번호 칸을 누구도 읽지 못하게 (2026-11-07)
-- 지금은 후기 표를 누구나 읽을 수 있어서, 비회원이 적은 비밀번호가 그대로 보였습니다.
-- 화면은 이제 비밀번호 칸을 읽지 않고, 쓰기·고치기·지우기는 서버(/api/place-comments, 관리자 권한)에서 합니다.
-- 아래는 비밀번호(password) 칸만 빼고 읽기를 허용합니다. 서버(service_role)는 영향 없습니다.
-- Supabase → SQL Editor에 붙여 넣고 실행하세요.

revoke select on public.reviews from anon, authenticated;
grant select (id, nickname, content, visit_date, created_at, user_key, auth_user_id, likes, place_id, deleted, is_edited, avatar_url, is_admin_deleted, sentiment_score)
  on public.reviews to anon, authenticated;

revoke select on public.review_replies from anon, authenticated;
grant select (id, review_id, nickname, content, likes, created_at, auth_user_id, is_edited, avatar_url, is_admin_deleted, user_key, deleted, is_owner)
  on public.review_replies to anon, authenticated;

-- 확인: 아래가 비어 있으면 성공(비밀번호 칸 읽기 권한 없음)
select grantee, table_name, column_name from information_schema.column_privileges
 where table_schema = 'public' and table_name in ('reviews', 'review_replies') and column_name = 'password'
   and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT';
