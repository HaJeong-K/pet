-- 열린 표 잠그기 (2026-11-08) — 배포 뒤 Supabase SQL Editor에서 한 번 실행
-- 1) 제보(proposals): 넣기·보기는 지금처럼 누구나, 고치기·지우기는 관리자만
-- 2) 찜·좋아요(reactions): 찜은 로그인 회원 본인 것만, 좋아요·싫어요 지우기는 서버(/api/place-reactions)로만
-- 3) 후기·답글 좋아요(review_likes, reply_likes): 넣기·지우기는 서버(/api/place-comments)로만
-- 4) 이메일 가입 여부 확인 함수: 화면에서 직접 못 부르게(서버 /api/auth/email-check만)
-- 서버(service_role)는 이 규칙과 상관없이 그대로 동작합니다.

begin;

-- 1) proposals
drop policy if exists "Anyone can update proposals" on public.proposals;
drop policy if exists "proposals_admin_update" on public.proposals;
drop policy if exists "proposals_admin_delete" on public.proposals;
create policy "proposals_admin_update" on public.proposals
  for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "proposals_admin_delete" on public.proposals
  for delete to authenticated using (public.is_admin_user());

-- 2) reactions
drop policy if exists "reactions_insert_policy" on public.reactions;
drop policy if exists "reactions_delete_policy" on public.reactions;
drop policy if exists "reactions_insert_guarded" on public.reactions;
drop policy if exists "reactions_delete_own" on public.reactions;
-- 좋아요·싫어요는 비회원도 넣을 수 있고(기기 키), 찜은 로그인 회원이 자기 계정으로만
create policy "reactions_insert_guarded" on public.reactions
  for insert to anon, authenticated
  with check (
    type in ('like', 'dislike')
    or (type = 'bookmark' and auth.uid() is not null and user_key = auth.uid()::text)
  );
-- 지우기는 로그인 회원 본인 것 또는 관리자만(비회원 좋아요 취소는 서버가 처리)
create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (user_key = auth.uid()::text or public.is_admin_user());

-- 3) review_likes / reply_likes — 화면은 보기만
drop policy if exists "review_likes_insert" on public.review_likes;
drop policy if exists "review_likes_delete" on public.review_likes;
drop policy if exists "Allow all for reply_likes_insert" on public.reply_likes;
drop policy if exists "Allow all for reply_likes_delete" on public.reply_likes;
-- 후기 좋아요 보기 규칙이 anon만 있어서 로그인 회원은 내 좋아요 표시를 못 읽던 문제도 함께
drop policy if exists "review_likes_select" on public.review_likes;
create policy "review_likes_select" on public.review_likes for select to anon, authenticated using (true);

-- 4) check_email_exists
revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
grant execute on function public.check_email_exists(text) to service_role;
alter function public.check_email_exists(text) set search_path = public, auth;

commit;

-- 확인(선택): 아래 결과에 "Anyone can update proposals", "reactions_delete_policy",
-- "review_likes_insert/delete", "Allow all for reply_likes_insert/delete"가 없으면 성공
-- select tablename, policyname, cmd, roles from pg_policies
--  where tablename in ('proposals','reactions','review_likes','reply_likes') order by 1, 3;
