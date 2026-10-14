-- scripts/sql/partner-inquiries-status.sql
--
-- 광고·제휴 문의의 처리 상태를 5단계로 늘립니다: 접수(new) → 협의 필요(discuss) → 진행 중(progress) → 완료(done) / 반려(rejected)
-- Supabase SQL 편집기에서 한 번 실행하세요(여러 번 실행해도 안전합니다). banner-ads.sql을 먼저 실행해 두세요.
-- 예전에는 접수(new)·완료(done) 두 가지만 저장할 수 있게 막혀 있어서, 그 제한을 새 것으로 바꿉니다.

alter table public.partner_inquiries drop constraint if exists partner_inquiries_status_check;
alter table public.partner_inquiries add constraint partner_inquiries_status_check
  check (status in ('new', 'discuss', 'progress', 'done', 'rejected'));

notify pgrst, 'reload schema';
