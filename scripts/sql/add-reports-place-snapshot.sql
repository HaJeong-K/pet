-- ── reports.place_name / reports.place_address 컬럼 추가 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 배경: 관리자 신고 관리 페이지에서 "장소 신고"의 장소명이 항상 "—"로만 표시되는
-- 문제가 있었습니다. 원인은 admin/reports/page.tsx가 신고를 읽어올 때마다
-- `places` 테이블을 report.place_id로 다시 조회해서 이름/주소를 가져오는데,
-- 관광공사·문화정보원·식품안전나라 공공데이터 출처 장소는 `places` 테이블에
-- 실제 행이 없는 합성 ID라(scripts/sql/fix-reports-place-id.sql 참고) 이 조회가
-- 항상 빈 값을 반환하기 때문입니다.
--
-- 지도에 보이는 장소 대다수가 공공데이터 출처라, 이 문제는 사실상 거의 모든
-- "장소 신고"에서 이름이 안 보이는 것과 같았습니다.
--
-- 해결: 매번 다시 조회해서 맞추는 대신, 신고를 접수하는 그 순간 사용자 화면에
-- 이미 떠 있는 장소명/주소를 reports 테이블에 그대로 같이 저장해둡니다(스냅샷).
-- 이러면 나중에 그 장소가 places 테이블에 있는지 없는지와 무관하게 항상
-- 정확한 이름이 보입니다. 기존 신고(이 컬럼이 비어있는 행)는 코드에서 예전처럼
-- places 조인으로 한 번 더 시도하도록 폴백을 남겨뒀습니다.

alter table public.reports
  add column if not exists place_name text,
  add column if not exists place_address text;
