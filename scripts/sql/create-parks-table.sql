-- ── 전국도시공원정보표준데이터용 parks 테이블 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 배경: recommend.ts에 "다음 단계: 공원 데이터 반영(조사 완료, 연동은 추후)"로 남겨뒀던
-- 행정안전부 "전국도시공원정보표준데이터"(data.go.kr/data/15012890/standard.do)를
-- 실제로 연동합니다. 이 데이터셋은 실시간 API가 아니라 파일(XLS/CSV/JSON) 다운로드 형태로
-- 제공되고, 위도/경도가 이미 포함돼 있어 별도 지오코딩이 필요 없습니다(한국문화정보원
-- 데이터와 동일한 패턴). scripts/import-parks.mjs 로 한 번 가공해서 이 테이블에
-- 적재해두고, src/lib/parkPlaces.ts가 그 테이블을 읽습니다.

create table if not exists public.parks (
  id bigint generated always as identity primary key,
  source_key text unique,
  name text not null,
  category text,
  address text,
  lat text,
  lng text,
  area text,
  management_agency text,
  phone text,
  facility_note text,
  created_at timestamptz default now()
);

-- ⚠ 이 테이블을 예전(facility_note 컬럼 추가 전) 버전으로 이미 만들어뒀을 수도 있어서,
-- create table if not exists만으로는 새 컬럼이 안 생깁니다 — 안전하게 별도로 추가합니다.
-- facility_note: 운동/유희/편익/교양/기타시설 5개 필드 중 값이 있는 것만 "라벨: 값" 형태로
-- 이어붙인 자유 텍스트입니다(화장실·개수대 여부 같은 정형 데이터가 원본에 없어서, 구조화된
-- 필드인 척하지 않고 원문 그대로 보여주는 메모 형태로 저장합니다).
alter table public.parks add column if not exists facility_note text;

alter table public.parks enable row level security;

-- 지도가 항상 조회해야 하므로 누구나 조회 가능해야 합니다(민감 정보 없음).
-- 쓰기(적재)는 scripts/import-parks.mjs가 service role 키로만 합니다.
drop policy if exists "parks_select_all" on public.parks;
create policy "parks_select_all"
  on public.parks for select
  using (true);
