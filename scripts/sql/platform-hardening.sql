-- 작성자 위조 막기 + 제재 장치 통일 (2026-11-13) — 배포 뒤 Supabase SQL Editor에서 한 번 실행
-- 1) 커뮤니티 글·댓글: 로그인만 하면 다른 회원 이름으로 넣을 수 있던 규칙을 "본인 계정으로만"으로 교체
--    (제한 중인 회원이 작성자 칸을 바꿔 제재를 피하는 길도 함께 막힘)
-- 2) 장소 사진: 본인 계정으로만, 하루 30장까지
-- 3) 예전 숙박 후기 전용 차단 기록을 새 제재 표로 옮김(지금은 0건)

begin;

-- 1) community_posts / community_comments
drop policy if exists "Allow authenticated insert" on public.community_posts;
drop policy if exists "로그인 유저만 작성" on public.community_posts;
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own" on public.community_posts
  for insert to authenticated
  with check (
    author_auth_key = auth.uid()
    and (auth_user_id is null or auth_user_id = auth.uid())
    -- 공지 글은 관리자만
    and (coalesce(is_notice, false) = false or public.is_admin_user())
  );

drop policy if exists "Allow authenticated comment insert" on public.community_comments;
drop policy if exists "community_comments_insert_own" on public.community_comments;
create policy "community_comments_insert_own" on public.community_comments
  for insert to authenticated
  with check (author_auth_key = auth.uid());

-- 2) place_images
drop policy if exists "authenticated can insert place_images" on public.place_images;
drop policy if exists "place_images_insert_own" on public.place_images;
create policy "place_images_insert_own" on public.place_images
  for insert to authenticated
  with check (auth_user_id is null or auth_user_id = auth.uid());

create or replace function public.limit_place_image_uploads()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today_count integer;
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') or auth.uid() is null then
    return new;
  end if;
  if public.is_admin_user() then return new; end if;
  select count(*) into today_count from public.place_images
   where auth_user_id = auth.uid() and created_at > now() - interval '1 day';
  if today_count >= 30 then
    raise exception '사진은 하루에 30장까지 올릴 수 있어요. 내일 다시 올려 주세요.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_place_image_uploads() from public, anon, authenticated;
drop trigger if exists limit_place_image_uploads on public.place_images;
create trigger limit_place_image_uploads before insert on public.place_images
  for each row execute function public.limit_place_image_uploads();

-- 3) 예전 숙박 후기 차단 → 새 제재(영구)로 옮기기. 표는 남겨 두되 더 쓰지 않습니다.
insert into public.member_sanctions (auth_user_id, stage, reason, severe)
select b.auth_user_id, 'ban', coalesce(nullif(b.reason, ''), '숙박 후기 운영정책 위반(이전 기록)'), false
  from public.lodging_review_bans b
 where not exists (select 1 from public.member_sanctions s where s.auth_user_id = b.auth_user_id and s.stage = 'ban' and s.lifted_at is null);

commit;
