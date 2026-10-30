-- 숙소 입실 조건·동반 규칙 세부 항목(접종 증명·동물등록·중성화·나이·체고·맹견·혼자 두기·침구·매너벨트·공용 공간 등)
-- 여러 번 실행해도 안전합니다. 항목 설명은 src/lib/petRequirements.ts
alter table public.lodging_profiles add column if not exists pet_requirements jsonb not null default '{}'::jsonb;
