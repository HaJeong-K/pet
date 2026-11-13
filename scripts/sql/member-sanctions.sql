-- 회원 이용 제재 (2026-11-13) — 배포 뒤 Supabase SQL Editor에서 한 번 실행
-- 1) 제재 기록 표(member_sanctions): 경고 · 기간 작성 제한 · 영구 정지
-- 2) 제한 중인 회원은 커뮤니티 글·댓글을 쓸 수 없게 DB에서 막기(화면을 우회해도 막힘)
-- 3) 같은 글을 서로 다른 회원 5명이 신고하면 운영진 확인 전까지 자동으로 가리기
-- 단계 기준(경고 → 7일 → 30일 → 영구)은 src/lib/sanctions.ts에 있습니다.

begin;

create table if not exists public.member_sanctions (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null,
  stage text not null check (stage in ('warning', 'suspend', 'ban')),
  days integer,
  reason text not null,
  severe boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  lifted_at timestamptz,
  lift_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_member_sanctions_user on public.member_sanctions (auth_user_id, created_at desc);

alter table public.member_sanctions enable row level security;
drop policy if exists "member_sanctions_own_select" on public.member_sanctions;
create policy "member_sanctions_own_select" on public.member_sanctions
  for select to authenticated using (auth_user_id = auth.uid() or public.is_admin_user());
-- 넣기·고치기는 서버(관리자 화면 → /api/admin/members)만 합니다.

-- 지금 작성이 제한된 회원이면 안내 문구, 아니면 null
create or replace function public.member_write_block(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when s.stage = 'ban' then '운영정책 위반으로 글쓰기가 영구 제한된 계정이에요. 이의가 있으면 문의하기로 알려 주세요.'
    else '운영정책 위반으로 ' || to_char(s.ends_at at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI') || '까지 글쓰기가 제한돼 있어요. 이의가 있으면 문의하기로 알려 주세요.'
  end
  from public.member_sanctions s
  where s.auth_user_id = p_user and s.lifted_at is null
    and (s.stage = 'ban' or (s.stage = 'suspend' and s.ends_at > now()))
  order by (s.stage = 'ban') desc, s.ends_at desc nulls first
  limit 1;
$$;
revoke execute on function public.member_write_block(uuid) from public, anon, authenticated;
grant execute on function public.member_write_block(uuid) to service_role;

create or replace function public.guard_sanctioned_writer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  writer uuid;
  blocked text;
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  writer := coalesce(nullif(to_jsonb(new)->>'author_auth_key', '')::uuid, nullif(to_jsonb(new)->>'auth_user_id', '')::uuid, auth.uid());
  if writer is null then return new; end if;
  blocked := public.member_write_block(writer);
  if blocked is not null then
    raise exception '%', blocked using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_sanctioned_writer() from public, anon, authenticated;

drop trigger if exists guard_sanctioned_writer on public.community_posts;
create trigger guard_sanctioned_writer before insert on public.community_posts
  for each row execute function public.guard_sanctioned_writer();
drop trigger if exists guard_sanctioned_writer on public.community_comments;
create trigger guard_sanctioned_writer before insert on public.community_comments
  for each row execute function public.guard_sanctioned_writer();

-- 신고 누적 임시 가림: 서로 다른 로그인 회원 5명이 같은 커뮤니티 글을 신고하면 "확인 대기"로 돌립니다(공지 제외).
-- 운영진이 관리자 > 글 검토에서 확인하면 다시 보이거나 반려됩니다.
create or replace function public.hold_post_on_reports()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reporters integer;
begin
  if new.type <> 'community_post' or new.target_id is null or new.target_id !~ '^[0-9]+$' then return new; end if;
  select count(distinct reporter_auth_user_id) into reporters
    from public.reports
   where type = 'community_post' and target_id = new.target_id and reporter_auth_user_id is not null and coalesce(resolution, '') <> 'dismissed';
  if reporters >= 5 then
    update public.community_posts
       set review_status = 'pending', review_reason = '신고 누적(서로 다른 회원 ' || reporters || '명)'
     where id = new.target_id::bigint and coalesce(is_notice, false) = false and coalesce(review_status, 'visible') = 'visible';
  end if;
  return new;
end;
$$;
revoke execute on function public.hold_post_on_reports() from public, anon, authenticated;
drop trigger if exists hold_post_on_reports on public.reports;
create trigger hold_post_on_reports after insert on public.reports
  for each row execute function public.hold_post_on_reports();

commit;
