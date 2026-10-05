-- ── 제보(proposals)에 동물병원 전용 칸 추가 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 제보 화면은 동물병원을 제보할 때 진료과목·가능 동물을 함께 보내는데, 이 칸이 장소 표(places)에만 있고
-- 제보 표에는 없어서 제보 저장이 통째로 실패했습니다(PGRST204).

alter table public.proposals add column if not exists specialty_department text;
alter table public.proposals add column if not exists treatable_animals text;

notify pgrst, 'reload schema';
