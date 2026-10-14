-- scripts/sql/banner-ads.sql
--
-- 배너 광고(사장님이 직접 만드는 문구·사진·글꼴)와 광고·제휴 문의에 필요한 표.
-- Supabase SQL 편집기에서 한 번 실행하세요(여러 번 실행해도 안전합니다). owner-store.sql을 먼저 실행해 두세요.
--
--   1) owner_banners            : 가게별 배너 내용(문구·사진·글꼴), 마지막으로 바꾼 날, 관리자가 풀어 준 추가 변경 횟수, 숨김 여부
--   2) banner_change_requests   : "2주에 한 번" 한도를 풀어 달라는 사장님의 요청과 처리 결과
--   3) banner_serves            : 가게별 배너 노출 횟수(여러 가게가 정확히 같은 횟수로 나가게 하는 데 씀)
--   4) pick_banners()           : 후보 가게 중 지금까지 가장 적게 나간 가게를 골라 횟수를 올리는 함수
--   5) partner_inquiries        : 사이트 아래 "광고·제휴 문의"로 들어온 글
--
-- ⚠ 표 모두 RLS를 켜고 정책을 만들지 않습니다 = 브라우저로는 읽지도 쓰지도 못하고, 우리 서버만 권한을 확인한 뒤 대신 합니다.

create table if not exists public.owner_banners (
  place_id       bigint primary key references public.places(id) on delete cascade,
  headline       text not null,                       -- 큰 문구
  body           text,                                -- 작은 문구
  image_url      text,                                -- 배너 사진(없으면 가게 사진)
  font           text not null default 'gothic',      -- 글꼴 이름표(src/lib/bannerCreative.ts의 BANNER_FONTS)
  changed_at     timestamptz not null default now(),  -- 사장님이 마지막으로 바꾼 때(2주 한도의 기준)
  extra_changes  integer not null default 0,          -- 관리자가 풀어 준 추가 변경 횟수(쓰면 하나씩 줄어듦)
  hidden         boolean not null default false,      -- 관리자가 내린 배너(부적절한 내용 등)
  hidden_reason  text,
  updated_by     uuid,
  created_at     timestamptz not null default now()
);
alter table public.owner_banners enable row level security;

create table if not exists public.banner_change_requests (
  id            bigserial primary key,
  place_id      bigint not null references public.places(id) on delete cascade,
  auth_user_id  uuid not null,
  reason        text not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  processed_by  text
);
create index if not exists banner_change_requests_place_idx on public.banner_change_requests (place_id, created_at desc);
create index if not exists banner_change_requests_status_idx on public.banner_change_requests (status, created_at desc);
alter table public.banner_change_requests enable row level security;

create table if not exists public.banner_serves (
  place_id     bigint primary key references public.places(id) on delete cascade,
  serve_count  bigint not null default 0
);
alter table public.banner_serves enable row level security;

-- 후보 가게(p_ids) 가운데 지금까지 가장 적게 나간 가게 p_n곳을 고르고(같으면 무작위), 고른 가게의 횟수를 1씩 올립니다.
-- 한 번에 한 요청씩 순서대로 처리되므로(행 잠금) 같은 후보끼리는 노출 횟수가 1번 넘게 벌어지지 않습니다.
-- 새로 들어온 가게는 기존 가게들의 가장 적은 횟수에서 시작합니다(처음부터 따라잡느라 혼자 독차지하지 않게).
create or replace function public.pick_banners(p_ids bigint[], p_n integer)
returns setof bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into banner_serves (place_id, serve_count)
  select id, coalesce((select min(serve_count) from banner_serves where place_id = any(p_ids)), 0)
  from unnest(p_ids) as id
  on conflict (place_id) do nothing;

  return query
  with picked as (
    select place_id from banner_serves
    where place_id = any(p_ids)
    order by serve_count asc, random()
    limit greatest(p_n, 1)
    for update
  )
  update banner_serves b set serve_count = b.serve_count + 1
  from picked where b.place_id = picked.place_id
  returning b.place_id;
end;
$$;
revoke all on function public.pick_banners(bigint[], integer) from public, anon, authenticated;
grant execute on function public.pick_banners(bigint[], integer) to service_role;

create table if not exists public.partner_inquiries (
  id            bigserial primary key,
  kind          text not null,                        -- ad(광고) | partner(제휴) | etc(기타)
  name          text not null,                        -- 담당자 이름
  company       text,                                 -- 회사·가게 이름
  contact       text not null,                        -- 답을 받을 이메일이나 전화번호
  message       text not null,
  auth_user_id  uuid,                                 -- 로그인한 회원이면 계정
  status        text not null default 'new' check (status in ('new', 'done')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
create index if not exists partner_inquiries_status_idx on public.partner_inquiries (status, created_at desc);
alter table public.partner_inquiries enable row level security;

notify pgrst, 'reload schema';
