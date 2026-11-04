-- 가게 공지 사진(최대 4장) — 사장님 센터 "공지"에서 올리고, 장소 상세·숙소 화면의 공지에 함께 보여 줍니다.
-- 사진은 공개 보관함 notice-images/가게 번호/… 에 저장되고, 서버가 그 가게의 사진인지 확인한 뒤에만 저장합니다.
alter table public.place_notices add column if not exists images text[] not null default '{}';
