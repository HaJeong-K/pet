-- 커뮤니티 공지 — 관리자만 공지(is_notice)를 올리거나 바꿀 수 있게 막습니다.
-- 예전에는 로그인한 누구나 글에 is_notice=true를 붙여 올릴 수 있었습니다(브라우저에서 직접 넣으면).
-- 서버(service role)·DB 관리자(SQL 편집기)는 제한 없음.
-- 여러 번 실행해도 안전합니다.

create or replace function public.guard_community_notice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  -- 공지로 올리거나(새 글), 공지 표시를 붙이거나 떼는 경우에만 확인합니다.
  if (tg_op = 'INSERT' and coalesce(new.is_notice, false))
     or (tg_op = 'UPDATE' and coalesce(new.is_notice, false) is distinct from coalesce(old.is_notice, false)) then
    if not exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.is_admin) then
      raise exception '공지는 관리자만 올릴 수 있어요.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_community_notice on public.community_posts;
create trigger trg_guard_community_notice
  before insert or update on public.community_posts
  for each row execute function public.guard_community_notice();
