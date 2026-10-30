-- 회원 표(users) 읽기·쓰기 범위 정리
-- 예전에는 누구나(로그인 안 한 사람 포함) 모든 회원의 이메일·사장님 연락처·사업자 정보를 읽고,
-- 다른 회원의 줄(닉네임 등)을 고칠 수 있었습니다.
-- (관리자 여부·인증 상태 등 권한 칸은 이미 protect-privileged-columns.sql이 막고 있습니다. 여기서는 빠진 부분만 더합니다.)
--   · 읽기 : 본인 줄 + 관리자는 전체 + 비회원 줄(닉네임만 있는 줄). 다른 회원의 공개 정보(닉네임·프로필 사진)는 public_profiles로만
--   · 쓰기 : 본인 줄(관리자는 전체), 비회원 줄
--   · 추가 보호(트리거) : 계정 연결(auth_user_id) 바꾸기 금지, 비회원 줄에 사장님 정보 금지,
--     연결된 가게는 사장님 신청(대기) 때만 변경, 닉네임에 사장님·운영진·관리자·같이가개 금지(사칭 방지 — 사장님은 "가게명 사장님" 배지로 표시)
-- 서버(service role)·DB 관리자(SQL 편집기)는 제한 없음. 여러 번 실행해도 안전합니다.

-- 지금 로그인한 사람이 관리자인지(정책 안에서 users를 다시 읽어도 무한 반복되지 않게 security definer)
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.users where auth_user_id = auth.uid() and is_admin = true);
$$;

alter table public.users enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (auth_user_id = auth.uid() or auth_user_id is null or public.is_admin_user());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert
  with check (auth_user_id = auth.uid() or auth_user_id is null or public.is_admin_user());

drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (auth_user_id = auth.uid() or auth_user_id is null or public.is_admin_user())
  with check (auth_user_id = auth.uid() or auth_user_id is null or public.is_admin_user());

-- protect-privileged-columns.sql에 없는 부분만 막습니다
create or replace function public.guard_users_privileged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') or public.is_admin_user() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 소셜 계정 이름에 금지어가 있어도 가입은 되게, 임시 닉네임으로 바꿉니다
    if replace(coalesce(new.nickname, ''), ' ', '') ~ '(사장님|운영진|관리자|같이가개)' then
      new.nickname := '회원' || substr(md5(random()::text), 1, 6);
    end if;
    if new.auth_user_id is null and (new.owner_status is not null or new.owner_place_id is not null) then
      raise exception '권한이 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception '권한이 없어요.' using errcode = '42501';
  end if;
  -- 연결된 가게는 신청(대기)할 때만 바꿀 수 있음
  if new.owner_place_id is distinct from old.owner_place_id and coalesce(new.owner_status, '') <> 'pending' then
    raise exception '권한이 없어요.' using errcode = '42501';
  end if;
  if new.nickname is distinct from old.nickname and replace(coalesce(new.nickname, ''), ' ', '') ~ '(사장님|운영진|관리자|같이가개)' then
    raise exception '이 닉네임은 쓸 수 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_users_privileged on public.users;
create trigger trg_guard_users_privileged
  before insert or update on public.users
  for each row execute function public.guard_users_privileged();

-- 다른 회원의 공개 정보(닉네임·프로필 사진)만 보는 창 — 후기 작성자 사진 등에 씁니다.
-- users 표의 읽기 제한을 일부러 건너뛰는 창이라 공개해도 되는 칸만 넣습니다.
create or replace view public.public_profiles as
  select auth_user_id, nickname, avatar_url from public.users where auth_user_id is not null;
grant select on public.public_profiles to anon, authenticated;
