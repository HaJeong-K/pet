-- ── place_images.place_id 외래키(FK) 제약 제거 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 배경: 관광공사·문화정보원·식품안전나라 공공데이터 출처 장소는 Supabase `places`
-- 테이블에 실제 행이 없고, 클라이언트에서 만든 합성 ID(예: 3,xxx,xxx,xxx번대)만
-- 갖습니다(src/lib/publicDataPlaces.ts의 toNumericId 참고). place_images.place_id에
-- `places(id)`를 참조하는 FK 제약이 걸려 있으면, 이런 공공데이터 장소에 사진을
-- 올리려 할 때 INSERT가 외래키 위반으로 조용히 실패합니다(장소 상세페이지에는
-- "이미지 업로드에 실패했습니다" 알림이 뜨지만, 원인을 알 수 없었던 문제입니다).
--
-- 문화원 CSV(67,000여 건)에는 애초에 이미지 컬럼 자체가 없고, 식약처 데이터도
-- 마찬가지라 이 장소들의 대표 사진은 사실상 관리자/업주가 직접 올리는 것이
-- 유일한 합법적 경로입니다(공공데이터가 제공하지 않는 이미지를 네이버 등에서
-- 대량 자동 수집하는 것은 저작권·이용약관 문제로 하지 않기로 했습니다). 그래서
-- place_images는 "실제 places 행이 있어야만 사진을 등록할 수 있다"는 제약을
-- 없애고, place_id를 단순 참조 값(공공데이터 합성 ID 포함)으로 취급하도록
-- 바꿉니다.
--
-- 아래는 안전하게(제약 이름을 몰라도) place_images 테이블에서 places를 참조하는
-- 외래키를 찾아 전부 제거합니다. 이미 제약이 없다면 아무 일도 하지 않습니다(멱등).

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.place_images'::regclass
      and confrelid = 'public.places'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.place_images drop constraint %I', r.conname);
  end loop;
end $$;

-- ── 확인용 ──
-- select conname, contype from pg_constraint where conrelid = 'public.place_images'::regclass;
