-- 장소 후기·답글 잠그기 (2026-11-07) — 이 파일 하나만 실행하면 됩니다(hide-comment-passwords.sql 내용 포함)
-- ① 화면(누구나)이 후기 표에 직접 쓰고·고치고·지우던 규칙을 없앱니다.
--    이제 쓰기·고치기·지우기·좋아요·관리자 삭제는 모두 서버(/api/place-comments)가 본인·비밀번호·관리자를 확인한 뒤에 합니다.
-- ② 비회원 비밀번호(password) 칸은 아무도 읽지 못하게 합니다.
-- 읽기(후기 보기)는 지금처럼 누구나 됩니다. 서버(service_role)는 영향 없습니다.
-- ⚠ 이 SQL은 새 코드가 배포된 뒤에 실행하세요(먼저 실행하면 예전 화면에서 후기 쓰기가 잠깐 안 됩니다).
-- Supabase → SQL Editor에 붙여 넣고 실행하세요.

-- ① 쓰기 규칙 없애기
drop policy if exists "allow insert reviews" on public.reviews;
drop policy if exists "allow update reviews" on public.reviews;
drop policy if exists "allow delete reviews" on public.reviews;
drop policy if exists "Allow admin update reviews" on public.reviews;

drop policy if exists "Allow insert for anyone" on public.review_replies;
drop policy if exists "Allow update for anyone" on public.review_replies;
drop policy if exists "Allow delete for anyone" on public.review_replies;
drop policy if exists "Allow admin update review_replies" on public.review_replies;

-- ② 비밀번호 칸 숨기기(나머지 칸만 읽기 허용)
revoke select on public.reviews from anon, authenticated;
grant select (id, nickname, content, visit_date, created_at, user_key, auth_user_id, likes, place_id, deleted, is_edited, avatar_url, is_admin_deleted, sentiment_score)
  on public.reviews to anon, authenticated;

revoke select on public.review_replies from anon, authenticated;
grant select (id, review_id, nickname, content, likes, created_at, auth_user_id, is_edited, avatar_url, is_admin_deleted, user_key, deleted, is_owner)
  on public.review_replies to anon, authenticated;

-- 확인 1: 남은 규칙이 SELECT(읽기)뿐이어야 합니다
select tablename, policyname, cmd from pg_policies where tablename in ('reviews', 'review_replies') order by 1, 3;
-- 확인 2: 아래가 비어 있으면 비밀번호 칸 숨김 성공
select grantee, table_name from information_schema.column_privileges
 where table_schema = 'public' and table_name in ('reviews', 'review_replies') and column_name = 'password'
   and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT';
