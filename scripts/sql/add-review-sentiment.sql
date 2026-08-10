-- ── 리뷰 감성분석 점수 저장용 컬럼 ──
-- Supabase SQL 편집기에서 실행하세요.
--
-- 지금은 리뷰 만족도 점수(affinityScore.ts의 reviewSatisfactionScore)를 단순 긍/부정
-- 키워드 매칭으로 계산하고 있습니다. 나중에 리뷰 데이터가 충분히 쌓이면 KoBERT 등
-- 파인튜닝된 한국어 감성분석 모델로 이 컬럼을 채우는 배치 작업을 붙이면 됩니다 —
-- affinityScore.ts는 이 컬럼 값이 있으면 그 값을 쓰고, 없으면(NULL) 기존 키워드
-- 방식으로 자동 폴백하도록 이미 구현해뒀습니다. 즉 이 컬럼을 채우는 배치만 나중에
-- 추가하면 되고, 앱 코드는 지금 이 마이그레이션 하나로 준비가 끝납니다.
--
-- ⚠ 실제 KoBERT 추론 파이프라인(모델 서빙 인프라)은 이 마이그레이션에 포함되어 있지
-- 않습니다 — 자체 호스팅(GPU 서버/서버리스) vs Hugging Face Inference API 등 방식을
-- 정한 뒤 별도 배치 작업(예: 리뷰 등록 시 웹훅으로 추론 호출, 또는 주기적 배치)으로
-- 이 컬럼을 채우면 됩니다.

alter table public.reviews add column if not exists sentiment_score numeric;

-- 0~100 스케일(100=매우 긍정, 0=매우 부정)로 통일합니다 — 기존 키워드 방식의
-- reviewSatisfactionScore()가 이미 0~100 스케일을 쓰고 있어서, 모델 점수를 그대로
-- 이어붙일 수 있도록 맞췄습니다.
comment on column public.reviews.sentiment_score is
  '0~100 감성 점수(100=매우 긍정). NULL이면 아직 감성분석 모델이 처리하지 않은 리뷰 — affinityScore.ts가 자동으로 키워드 기반 점수로 폴백합니다.';
