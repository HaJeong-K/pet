-- ── 숙소 입점 신청 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다.
--
-- 숙소 사장님이 사장님 센터에서 "입점 신청"을 하면 한 줄이 생깁니다(「같이가개 숙소 입점 계약서」 제5조).
--   · 내 숙소 고르기: 지도에 있는 숙소(공공데이터 숙소 포함)를 찾아 고르거나, 없으면 새로 적음
--   · 숙박업 영업신고증(사진·PDF — 비공개 보관함 owner-docs), 정산 계좌, 입점 계약 동의
--   · 관리자가 승인하면: 공공데이터 숙소는 같이가개 장소로 옮기고(원래 공공데이터 칸은 숨김) 사장님 숙소로 연결,
--     입점일(partner_since)이 정해져 그날부터 3개월은 수수료 5%(런칭 프로모션), 이후 8%(프리미엄 5%)
--   · 승인 전에는 객실을 미리 올려 둘 수 있지만 손님에게는 예약이 열리지 않습니다.
-- 서버는 /api/owner/lodging/partner, /api/admin/lodging-partners. 브라우저가 직접 읽지 못하게 정책을 두지 않습니다.

create table if not exists lodging_partners (
  id bigserial primary key,
  owner_auth_user_id uuid not null unique,         -- 사장님 한 명당 한 줄(다시 신청하면 고쳐 씀)
  requested_place_id bigint,                       -- 고른 숙소(직접 등록 장소 번호 또는 공공데이터 번호). 새로 적으면 null
  place_name text not null,
  place_address text,
  place_phone text,
  status text not null default 'pending',          -- pending | approved | rejected
  license_path text,                               -- owner-docs 보관함 안의 영업신고증 경로
  bank_name text,
  account_number text,
  account_holder text,
  contract_version text,                           -- 동의한 입점 계약서 판(예: 2026-10-28)
  agreed_at timestamptz,
  linked_place_id bigint,                          -- 승인 후 연결된 같이가개 장소 번호
  partner_since date,                              -- 입점일(승인일) — 수수료 프로모션 기준
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists idx_lodging_partners_status on lodging_partners(status, created_at);
create index if not exists idx_lodging_partners_place on lodging_partners(linked_place_id) where status = 'approved';
alter table lodging_partners enable row level security;

notify pgrst, 'reload schema';

-- ── 확인용 ──
-- select status, count(*) from lodging_partners group by 1;
