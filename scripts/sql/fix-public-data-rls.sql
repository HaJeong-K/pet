-- ── culture_facilities / foodsafety_restaurants 공개 읽기 정책 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 증상: Table Editor(관리자 권한)로는 데이터가 보이는데, 실제 앱 화면(anon key로 조회)에는
-- 하나도 안 뜨는 경우 — 이 두 테이블을 Supabase 대시보드 Table Editor UI로 새로 만들면
-- 기본적으로 Row Level Security(RLS)가 켜지는데, 이때 별도 SELECT 정책을 안 만들면
-- 익명 키(anon key, 즉 앱이 쓰는 키)로는 조회 결과가 조용히 항상 0건으로 나옵니다.
-- 에러가 안 나서 원인 파악이 어렵습니다 — 정확히 "DB엔 있는데 화면엔 안 뜬다"는 증상과
-- 일치합니다.
--
-- enable row level security는 이미 켜져 있어도 다시 실행해도 안전(멱등)합니다.

alter table culture_facilities enable row level security;
alter table foodsafety_restaurants enable row level security;

drop policy if exists "culture_facilities 공개 읽기" on culture_facilities;
create policy "culture_facilities 공개 읽기"
  on culture_facilities for select
  using (true);

drop policy if exists "foodsafety_restaurants 공개 읽기" on foodsafety_restaurants;
create policy "foodsafety_restaurants 공개 읽기"
  on foodsafety_restaurants for select
  using (true);

-- ── 확인용: 정책이 잘 붙었는지 확인 ──
-- select tablename, policyname, cmd, qual
-- from pg_policies
-- where tablename in ('culture_facilities', 'foodsafety_restaurants');
