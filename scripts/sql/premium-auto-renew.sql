-- ── 요금제 자동 연장 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다. (add-premium.sql 다음에 실행)
--
-- 사장님이 "기한이 끝나면 자동으로 연장할지"를 정해 둡니다(사장님 센터 팝업·광고 상품 메뉴).
--   · enabled: true = 자동 연장, false = 이번 기간만, null = 아직 안 정함(팝업·알림으로 물어봄)
--   · 매일 새벽 작업이 만료 3일 전에 같은 요금제·개월 수로 연장 신청을 자동으로 넣고, 사장님에게 입금 안내를 보냅니다.
--     (결제대행 연동 전이라 신청까지 자동이고, 결제는 지금처럼 입금 확인 후 관리자 승인)
--   · 만료 7일 전까지 정하지 않았으면 사장님 기기로 한 번 물어봅니다(reminded_for).
-- 서버는 /api/owner/auto-renew, 새벽 작업은 src/lib/server/premiumRenew.ts. 브라우저가 직접 읽지 못하게 정책을 두지 않습니다.

create table if not exists premium_auto_renew (
  place_id bigint primary key,
  enabled boolean,
  plan text,                       -- 연장할 요금제(premium | store | local) — 비우면 지금 요금제
  months integer not null default 1,
  decided_at timestamptz,
  decided_by uuid,
  reminded_for date,               -- 이 만료일에 대해 "자동 연장 여부를 정해 주세요" 알림을 보냄
  renewed_for date,                -- 이 만료일에 대해 연장 신청을 넣음
  updated_at timestamptz not null default now()
);
alter table premium_auto_renew enable row level security;

-- 확인:
-- select * from premium_auto_renew;
