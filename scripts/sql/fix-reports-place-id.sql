-- ── reports.place_id 외래키(FK) 제거 + bigint로 확장 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 배경: "장소 신고" 버튼을 누르면 콘솔에 "장소 신고 오류: {}"만 찍히고 아무 알림도
-- 없이 조용히 실패하는 문제가 있었습니다. 원인은 scripts/sql/fix-place-images-fk.sql
-- 이 이미 한 번 고쳤던 것과 완전히 동일한 패턴입니다:
--
-- 1) FK 제약: 관광공사·문화정보원·식품안전나라 공공데이터 출처 장소는 Supabase
--    `places` 테이블에 실제 행이 없고, 클라이언트에서 만든 합성 ID만 갖습니다
--    (src/lib/publicDataPlaces.ts의 toNumericId 참고). reports.place_id에
--    `places(id)`를 참조하는 FK 제약이 걸려 있으면, 이런 공공데이터 장소를
--    신고하려 할 때 INSERT가 외래키 위반으로 실패합니다.
--
-- 2) 정수 범위 초과: toNumericId는 소스별 밑수(관광공사 10억/식약처 20억/문화정보원
--    30억) + 해시값(0~약 42억)을 더해서 ID를 만듭니다. 문화정보원 출처는 밑수만으로
--    이미 PostgreSQL의 4바이트 integer 최댓값(약 21억)을 넘고, 나머지 소스도 절반
--    이상이 해시값 때문에 넘어갑니다. place_id 컬럼이 integer 타입이면 이런 장소를
--    신고할 때 "integer out of range" 오류가 나서 역시 INSERT가 실패합니다.
--    (실제로 문화정보원·식약처 출처 샘플의 100%, 관광공사 출처의 약 절반이 21억을
--    초과하는 것을 직접 계산해 확인했습니다.)
--
-- 이 두 가지가 겹쳐서, 공공데이터 출처 장소(지도에 보이는 장소 대다수)를 신고하면
-- 사실상 항상 실패하고 있었을 가능성이 높습니다. 아래 스크립트는 place_images 때와
-- 동일하게 (1) places를 참조하는 FK를 제거하고 (2) place_id를 bigint로 넓힙니다.
-- 이미 제약이 없거나 이미 bigint여도 안전합니다(멱등).

-- 1) FK 제약 제거
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and confrelid = 'public.places'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.reports drop constraint %I', r.conname);
  end loop;
end $$;

-- 2) place_id 컬럼을 bigint로 확장 (이미 bigint면 아무 일도 일어나지 않음)
alter table public.reports
  alter column place_id type bigint using place_id::bigint;

-- ── 같은 원인으로 조용히 실패할 수 있는 다른 테이블들도 함께 정리 ──
-- reviews/reactions도 공공데이터 장소의 place_id를 그대로 저장하므로 이론상 같은
-- 문제를 겪을 수 있습니다. 아직 신고된 증상은 아니지만, 재발을 막기 위해 같은
-- 처리를 미리 해둡니다.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and confrelid = 'public.places'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.reviews drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.reviews
  alter column place_id type bigint using place_id::bigint;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reactions'::regclass
      and confrelid = 'public.places'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.reactions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.reactions
  alter column place_id type bigint using place_id::bigint;

-- ── 확인용 ──
-- select conname, contype from pg_constraint where conrelid = 'public.reports'::regclass;
-- select column_name, data_type from information_schema.columns where table_name in ('reports','reviews','reactions') and column_name = 'place_id';
