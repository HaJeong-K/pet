-- 공공데이터 3종 중 Supabase에 반입(ETL)하는 2개 테이블만 데이터 초기화(재사용).
-- DROP이 아니라 TRUNCATE라서 테이블/컬럼 구조는 그대로 남고 안의 행만 지웁니다.
-- (한국관광공사 데이터는 테이블에 안 쌓고 /api/public-data/tour에서 매번 실시간으로 가져오므로 대상 아님)

truncate table culture_facilities restart identity;
truncate table foodsafety_restaurants restart identity;
