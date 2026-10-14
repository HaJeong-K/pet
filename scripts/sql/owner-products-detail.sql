-- scripts/sql/owner-products-detail.sql
--
-- 상품을 더 자세히 올릴 수 있게 owner_products에 칸을 추가합니다(사진·분류·용량·재료·알레르기·원산지·주의사항·대표 상품·품절).
-- Supabase SQL 편집기에서 한 번 실행하세요(여러 번 실행해도 안전합니다). owner-store.sql을 먼저 실행해 두세요.
-- 추가하는 칸은 모두 비워 둘 수 있습니다 — 장난감처럼 재료·알레르기가 없는 상품은 적지 않으면 됩니다.

alter table public.owner_products add column if not exists category    text;                           -- 분류(예: 수제 간식, 장난감) — 손님 화면에서 묶어 보여 줌
alter table public.owner_products add column if not exists image_url   text;                           -- 상품 사진
alter table public.owner_products add column if not exists unit        text;                           -- 용량·크기·구성(예: 100g, S·M·L, 3개입)
alter table public.owner_products add column if not exists ingredients text;                           -- 재료(먹는 것)·소재(용품)
alter table public.owner_products add column if not exists allergy     text;                           -- 알레르기 정보
alter table public.owner_products add column if not exists origin      text;                           -- 원산지·제조
alter table public.owner_products add column if not exists caution     text;                           -- 주의사항·보관 방법·급여 대상
alter table public.owner_products add column if not exists is_featured boolean not null default false; -- 대표 상품(맨 앞에 "대표" 표시)
alter table public.owner_products add column if not exists sold_out    boolean not null default false; -- 품절(손님에게 보이지만 예약은 못 함)

notify pgrst, 'reload schema';
