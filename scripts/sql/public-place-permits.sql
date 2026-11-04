-- 공공데이터 장소 ↔ 행정안전부 인허가 기록 맞춘 결과(2026-11-04, src/lib/server/permitEnrich.ts)
-- 매일 새벽 작업이 채우고, 지도 목록을 만들 때 빈 전화번호를 채우는 데 씁니다. 서버만 읽고 씁니다(정책 없음).
create table if not exists public.public_place_permits (
  place_id bigint primary key,
  matched boolean not null default false,   -- 같은 가게로 확실히 맞춘 기록이 있으면 true(못 찾았어도 다시 묻지 않도록 줄을 남김)
  kind text,                                 -- 맞춘 인허가 업종(hospital·restaurant 등 — src/lib/permitMatch.ts)
  permit_name text,                          -- 인허가 기록의 가게 이름
  phone text,
  status text check (status in ('open','suspended','closed')),
  closed_on text,
  checked_at timestamptz not null default now()
);
alter table public.public_place_permits enable row level security;
create index if not exists idx_public_place_permits_checked on public.public_place_permits(checked_at);

-- 공공데이터 API 하루 사용량(한국 날짜 기준) — 하루 한도(종류별 1만 건)를 넘기지 않도록 부를 때마다 1씩 올립니다.
create table if not exists public.api_daily_usage (
  day date not null,
  api text not null,
  used integer not null default 0,
  primary key (day, api)
);
alter table public.api_daily_usage enable row level security;
create or replace function public.bump_api_usage(p_api text, p_n integer default 1)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into api_daily_usage (day, api, used) values ((now() at time zone 'Asia/Seoul')::date, p_api, p_n)
  on conflict (day, api) do update set used = api_daily_usage.used + excluded.used
  returning used;
$$;
revoke all on function public.bump_api_usage(text, integer) from public, anon, authenticated;
