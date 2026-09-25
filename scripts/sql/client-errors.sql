-- ── 에러 모니터링(/admin/errors) 로그 테이블 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- Sentry 같은 외부 SaaS는 별도 계정/DSN 발급이 필요해서 지금 당장 붙일 수 없어,
-- 우리 Supabase 안에 가볍게 자체 로그 테이블을 두는 방식으로 시작합니다. 나중에
-- Sentry 계정을 만들면 이 테이블/화면은 그대로 두고 @sentry/nextjs만 추가로 붙이면 됩니다.

create table if not exists client_errors (
  id bigserial primary key,
  message text not null,
  stack text,
  source text,           -- 'window.onerror' | 'unhandledrejection' | 'react-error-boundary' | 'server'
  path text,
  user_agent text,
  auth_user_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_client_errors_created on client_errors(created_at desc);
