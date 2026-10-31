-- 커뮤니티 글 저장과 사용자 차단 — 본인 것만 읽고 쓸 수 있습니다. 여러 번 실행해도 안전합니다.
create table if not exists public.community_saves (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  post_id bigint not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, post_id)
);
create table if not exists public.community_blocks (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, blocked_user_id)
);
alter table public.community_saves enable row level security;
alter table public.community_blocks enable row level security;
drop policy if exists "내 저장 글" on public.community_saves;
create policy "내 저장 글" on public.community_saves for all to authenticated using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
drop policy if exists "내 차단 목록" on public.community_blocks;
create policy "내 차단 목록" on public.community_blocks for all to authenticated using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id and auth.uid() <> blocked_user_id);
