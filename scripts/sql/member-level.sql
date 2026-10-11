-- ── 회원 레벨 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 레벨 규칙(점수·단계·방문 조건)은 src/lib/memberLevel.ts에 있습니다. 여기서는 그 계산에 필요한 기록만 만듭니다.
--   1) member_visits : 회원이 로그인한 채로 들어온 날(하루에 한 줄, 한국 시간 기준)
--   2) member_levels : 회원마다 지금 레벨(매달 심사를 이어 가려면 지난 상태를 기억해야 합니다)
--   3) reports.reporter_auth_user_id : 누가 신고했는지(받아들여진 신고에 점수를 주려면 필요 — 지금까지는 기기 번호만 저장)
--   4) place_images.auth_user_id     : 장소 사진을 누가 올렸는지("장소 사진 등록" 점수 — 지금까지는 저장하지 않았습니다)

create table if not exists public.member_visits (
  auth_user_id uuid not null,
  visit_day date not null,                           -- 한국 시간 기준 날짜
  created_at timestamptz not null default now(),
  primary key (auth_user_id, visit_day)
);

create table if not exists public.member_levels (
  auth_user_id uuid primary key,
  level integer not null default 1,                  -- 지금 표시되는 단계(1~6)
  earned_level integer not null default 1,           -- 지금까지 달성한 가장 높은 단계
  evaluated_month text not null,                     -- 여기까지 월말 심사를 마친 달(YYYY-MM)
  started_month text not null,                       -- 레벨을 처음 받은 달(이 달은 방문 부족으로 내리지 않음)
  points integer not null default 0,                 -- 마지막으로 계산한 점수
  map_contributions integer not null default 0,      -- 마지막으로 계산한 지도 기여 횟수
  updated_at timestamptz not null default now()
);

alter table public.reports add column if not exists reporter_auth_user_id uuid;

-- 신고가 들어올 때 "누가 신고했는지"를 DB가 직접 채웁니다(로그인한 회원이면 그 회원, 아니면 비움).
-- 브라우저가 보낸 값은 무시하므로, 다른 사람 이름으로 신고 점수를 쌓을 수 없습니다.
create or replace function public.set_report_reporter()
returns trigger language plpgsql as $fn$
begin
  new.reporter_auth_user_id := auth.uid();
  return new;
end $fn$;
drop trigger if exists reports_set_reporter on public.reports;
create trigger reports_set_reporter before insert on public.reports
  for each row execute function public.set_report_reporter();

-- 장소 사진을 올릴 때 "누가 올렸는지"도 DB가 직접 채웁니다(브라우저가 보낸 값은 무시).
-- 관리자가 올리는 사진(제보를 승인할 때 함께 등록되는 사진 등)은 올린 사람을 비워 둡니다 — 제보한 회원은
-- 제보 승인 점수를 이미 받고, 관리자가 그 사진 점수까지 받으면 안 되기 때문입니다.
alter table public.place_images add column if not exists auth_user_id uuid;
create or replace function public.set_place_image_uploader()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or exists (select 1 from public.users where auth_user_id = auth.uid() and is_admin) then
    new.auth_user_id := null;
  else
    new.auth_user_id := auth.uid();
  end if;
  return new;
end $fn$;
drop trigger if exists place_images_set_uploader on public.place_images;
create trigger place_images_set_uploader before insert on public.place_images
  for each row execute function public.set_place_image_uploader();

-- 브라우저에서 직접 읽거나 고치지 못하게 막습니다(정책 없음 = 서버만 접근). 화면은 서버 API를 거칩니다.
-- (레벨을 브라우저에서 직접 고칠 수 있으면 조작할 수 있으므로 반드시 서버에서만 씁니다.)
alter table public.member_visits enable row level security;
alter table public.member_levels enable row level security;

-- 지금까지의 방문 기록 채우기: 사이트 이용 기록(analytics_events)에서 로그인한 채로 들어온 날을 옮겨 옵니다.
-- (이걸 하지 않으면 모든 회원이 "이번 달 방문 0일"에서 시작합니다.)
insert into public.member_visits (auth_user_id, visit_day)
select distinct auth_user_id, (created_at at time zone 'Asia/Seoul')::date
from public.analytics_events
where auth_user_id is not null
on conflict do nothing;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select count(*) as 방문기록, count(distinct auth_user_id) as 회원수 from member_visits;
-- select * from member_levels order by level desc, points desc;
