-- 커뮤니티 글 좋아요·싫어요 (2026-11-06)
-- community_post_likes 는 RLS 가 켜져 있는데 규칙이 하나도 없어 좋아요가 한 건도 저장되지 않았습니다.
-- 저장(community_saves)과 같이 로그인 회원만 누를 수 있게 하고, 자기 것만 지울 수 있게 합니다.
-- 개수는 누구나 볼 수 있습니다.

create table if not exists public.community_post_dislikes (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.community_posts(id) on delete cascade,
  user_key text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_key)
);
alter table public.community_post_dislikes enable row level security;
create index if not exists community_post_dislikes_post_idx on public.community_post_dislikes(post_id);

do $$
declare t text;
begin
  foreach t in array array['community_post_likes', 'community_post_dislikes'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);
    execute format('create policy "%1$s_select" on public.%1$I for select using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (user_key = auth.uid()::text)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (user_key = auth.uid()::text)', t);
  end loop;
end $$;
