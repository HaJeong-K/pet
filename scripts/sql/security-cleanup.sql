-- DB 보안 경고 정리 (2026-11-08) — Supabase SQL Editor에서 한 번 실행
-- Supabase 보안 점검(Advisors)의 경고 중 안전하게 고칠 수 있는 것만 담았습니다.
-- 화면·서버 동작은 바뀌지 않습니다.

begin;

-- 1) 함수의 search_path 고정(이름이 같은 가짜 표·함수로 바꿔치기 당하지 않게)
alter function public.check_nickname_exists(text) set search_path = public;
alter function public.kpi_monthly(integer) set search_path = public;
alter function public.moderate_content_trigger() set search_path = public;
alter function public.protect_user_privileged_columns() set search_path = public;
alter function public.set_report_reporter() set search_path = public;

-- 2) 바깥(화면)에서 부를 필요가 없는 함수의 실행 권한 거두기
--    트리거 함수는 실행 권한이 없어도 트리거로는 그대로 돌아갑니다.
revoke execute on function public.guard_community_notice() from public, anon, authenticated;
revoke execute on function public.guard_users_privileged() from public, anon, authenticated;
revoke execute on function public.review_post_trigger() from public, anon, authenticated;
revoke execute on function public.set_place_image_uploader() from public, anon, authenticated;
revoke execute on function public.stamp_review_author() from public, anon, authenticated;
revoke execute on function public.stamp_review_reply() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
--    성과지표 집계는 관리자 서버(/api/admin/kpi)만 부릅니다.
revoke execute on function public.kpi_monthly(integer) from public, anon, authenticated;
grant execute on function public.kpi_monthly(integer) to service_role;

commit;

-- 일부러 그대로 두는 경고(고치면 기능이 멈춤)
--  · is_admin_user : DB 규칙(관리자만 고치기 등)이 이 함수로 관리자를 판단 → 화면 권한 필요
--  · moderate_text, review_reason_for : 글 쓸 때 금칙어 검사 트리거가 부름 → 화면 권한 필요
--  · check_nickname_exists : 가입·닉네임 변경 화면의 중복 확인(닉네임은 원래 공개 정보)
--  · public_profiles 보기 : 다른 회원의 닉네임·사진만 보여 주려고 일부러 관리자 권한으로 만든 것
--  · "규칙 없는 표"(39개) : 서버만 읽고 쓰는 표라 화면은 아예 못 건드리는 상태(정상)
--  · btree_gist 확장 위치 : 숙소 예약 날짜 겹침 방지에 쓰임, 옮기는 이득이 작음
--  · 유출된 비밀번호 차단 : Supabase Pro 요금제에서 켜기(docs/paid-items-checklist.md 2번)
