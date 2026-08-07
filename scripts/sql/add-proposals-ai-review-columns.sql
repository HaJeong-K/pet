-- ── proposals 테이블에 AI 비전 검증 결과 저장용 컬럼 추가 ──
-- Supabase SQL 편집기에서 그대로 실행하세요. (이미 있으면 아무 일도 하지 않음 — 멱등)
--
-- 제보하기(jebo) 필수 사진 2장을 AI가 자동으로 1차 판별한 결과를 저장합니다.
--   ai_verified: AI가 "확실히 적합"으로 판단해서 자동 승인(=바로 지도에 등록)됐는지
--   ai_review:   판별 결과 전체(적합 여부, 확신도, 판단 이유)를 JSON으로 보관 —
--                자동 승인되지 않은 건도 관리자가 검토할 때 AI의 1차 판단을 참고할 수 있게 합니다.

alter table public.proposals
  add column if not exists ai_verified boolean default false;

alter table public.proposals
  add column if not exists ai_review jsonb;
