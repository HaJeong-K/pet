-- ── 숙소 크기·종류별 반려동물 추가 요금 + 부가 옵션(바비큐 등) + 객실 요일별 요금 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. (lodging.sql 다음에 실행)
--
-- pet_fees: {"small": 10000, "medium": 15000, "large": 20000, "cat": 10000, "other": 5000} — 1마리·1박, 비운 칸은 기본 pet_fee
-- extras:   [{"id": "...", "name": "바비큐(숯·그릴)", "price": 30000, "unit": "stay"|"night"|"person", "max": 2, "note": "..."}]
-- 사장님이 사장님 센터 "숙소·객실"에서 정하고, 손님 예약 금액은 서버가 이 값으로 다시 계산합니다.
-- 손님이 고른 반려동물 견종·부가 옵션은 lodging_bookings.pets / price_detail(jsonb)에 함께 저장돼 표를 바꿀 필요가 없습니다.

alter table lodging_profiles add column if not exists pet_fees jsonb not null default '{}'::jsonb;
alter table lodging_profiles add column if not exists extras jsonb not null default '[]'::jsonb;

-- weekday_prices: [일, 월, 화, 수, 목, 금, 토] 1박 요금(빈 요일은 null → 평일·주말 요금). 날짜별로 바꾼 요금이 있으면 그게 먼저
alter table lodging_rooms add column if not exists weekday_prices jsonb;

-- 확인:
-- select place_id, pet_fee, pet_fees, extras from lodging_profiles;
-- select id, name, base_price, weekend_price, weekday_prices from lodging_rooms;
