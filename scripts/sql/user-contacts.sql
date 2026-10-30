-- 회원 휴대폰 번호(아이디 찾기 전용) — 회원 표(users)와 따로 둡니다.
-- users 표는 지금 누구나 읽을 수 있어서 개인 연락처를 넣으면 안 됩니다. 이 표는 본인만 읽고 쓸 수 있고,
-- 아이디 찾기는 서버(service role, /api/auth/find-id)에서만 찾습니다.
-- 여러 번 실행해도 안전합니다.

create table if not exists public.user_contacts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null,               -- 숫자만(예: 01012345678)
  updated_at timestamptz not null default now()
);

create index if not exists user_contacts_phone_idx on public.user_contacts (phone);

alter table public.user_contacts enable row level security;

drop policy if exists user_contacts_select_own on public.user_contacts;
create policy user_contacts_select_own on public.user_contacts
  for select to authenticated using (auth.uid() = auth_user_id);

drop policy if exists user_contacts_insert_own on public.user_contacts;
create policy user_contacts_insert_own on public.user_contacts
  for insert to authenticated with check (auth.uid() = auth_user_id);

drop policy if exists user_contacts_update_own on public.user_contacts;
create policy user_contacts_update_own on public.user_contacts
  for update to authenticated using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);

-- 번호 모양 확인(010으로 시작하는 10~11자리 숫자)
alter table public.user_contacts drop constraint if exists user_contacts_phone_format;
alter table public.user_contacts add constraint user_contacts_phone_format check (phone ~ '^01[016789][0-9]{7,8}$');

-- 이름(아이디 찾기는 이름 + 휴대폰 번호가 둘 다 맞아야 알려 줍니다)
alter table public.user_contacts add column if not exists name text;
alter table public.user_contacts drop constraint if exists user_contacts_name_len;
alter table public.user_contacts add constraint user_contacts_name_len check (name is null or char_length(name) between 1 and 30);
create index if not exists user_contacts_name_phone_idx on public.user_contacts (name, phone);
