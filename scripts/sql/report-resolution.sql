-- ── 신고 처리 결과(받아들임 / 기각) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 지금까지는 신고가 "처리됨(is_resolved)"인지만 남았고, 신고가 맞아서 조치했는지 문제없어 그대로 뒀는지는
-- 구분되지 않았습니다. 회원 레벨에서 "받아들여진 신고"만 기여로 세려면 이 구분이 필요합니다(src/lib/memberLevel.ts).
--
--   resolution = 'accepted'  : 받아들임 — 신고된 글·댓글·장소를 관리자가 실제로 삭제·숨김 처리함
--              = 'dismissed' : 기각 — 문제없다고 보고 신고만 닫음
--              = null        : 아직 처리 전이거나, 이 칸을 만들기 전에 처리된 신고(구분 불가)
--   resolved_at : 처리한 시각
--
-- 값은 관리자 화면(신고 관리)이 처리할 때 함께 기록합니다. 이 칸을 만들기 전에 처리된 신고는 null로 남고,
-- 레벨 점수에는 들어가지 않습니다(어느 쪽인지 알 수 없어서).

alter table public.reports add column if not exists resolution text;
alter table public.reports add column if not exists resolved_at timestamptz;
do $$ begin
  alter table public.reports add constraint reports_resolution_check check (resolution is null or resolution in ('accepted', 'dismissed'));
exception when duplicate_object then null; end $$;
create index if not exists idx_reports_resolution on public.reports(resolution) where resolution is not null;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select resolution, count(*) from reports where is_resolved group by resolution;
