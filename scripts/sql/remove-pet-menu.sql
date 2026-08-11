-- ── 펫 메뉴(pet_menu) 컬럼 완전 삭제 ──
-- Supabase SQL 편집기에서 실행하세요.
--
-- pet_menu는 추천 점수 계산(recommend.ts/scoringConfig.ts)에서 이미 폐지됐고
-- (어떤 공공데이터도 펫 메뉴 여부를 분류해서 제공하지 않아 소수 제보 장소만
-- 가점을 받는 불공정한 구조였음), 장소 상세페이지 화면에서도 노출되지
-- 않습니다. 2026.08 기준 제보하기/정보추가 폼, 관리자 tips 검토 화면, 제안
-- 승인 로직(approveProposal.ts/applyInfoUpdateProposal.ts), 사장님 수정 API,
-- 공공데이터 매핑까지 코드 전역에서 모두 제거해서 이제 이 컬럼을 쓰는 곳이
-- 없습니다. 컬럼 자체도 정리합니다.
--
-- ⚠ 되돌릴 수 없는 작업입니다 — 지금까지 제보/입력된 펫 메뉴 텍스트 값이
-- 있다면 이 스크립트 실행과 함께 사라집니다. 필요하면 실행 전에 백업하세요:
--   select id, pet_menu from public.places where pet_menu is not null;
--   select id, pet_menu from public.proposals where pet_menu is not null;

alter table public.places drop column if exists pet_menu;
alter table public.proposals drop column if exists pet_menu;
