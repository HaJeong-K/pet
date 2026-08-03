-- ── 사장님(업주) 계정 시스템 — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 실행 순서 무관, 전부 IF NOT EXISTS라 여러 번 실행해도 안전합니다.

-- 1) users 테이블에 사장님 관련 컬럼 추가
alter table users add column if not exists owner_status text default null;
  -- null(일반 회원) | 'pending'(승인 대기) | 'verified'(인증 완료) | 'rejected'(반려)
alter table users add column if not exists owner_place_id bigint default null;
  -- 인증된 사장님이 실제로 운영하는 places.id (아직 지도에 없으면 null — 제보로 등록 후 관리자가 연결)
alter table users add column if not exists owner_business_name text default null;
alter table users add column if not exists owner_region text default null;
alter table users add column if not exists owner_phone text default null;
alter table users add column if not exists nickname_locked boolean default false;
  -- true면 마이페이지에서 닉네임 변경 불가 (사장님 닉네임은 [지역명]가게명_사장 고정)

-- 1-1) 사장님 가입 상세주소 + 사업자등록증 자동검증용 컬럼 추가
alter table users add column if not exists owner_sigungu text default null;
  -- 시/군/구 (다음 주소검색 API 결과, owner_region은 시/도만 저장)
alter table users add column if not exists owner_address_detail text default null;
  -- 도로명주소 전체 + 상세주소(건물/층/호수)
alter table users add column if not exists owner_cert_url text default null;
  -- 업로드한 사업자등록증 이미지 URL (owner-docs 스토리지 버킷)
alter table users add column if not exists owner_auto_verified boolean default false;
  -- true면 사업자등록증 OCR 자동대조로 즉시 승인된 계정 (관리자 수동승인 아님)
alter table users add column if not exists owner_ocr_text text default null;
  -- 사업자등록증에서 추출한 OCR 원문 일부 (관리자가 수동검토 시 대조용, 최대 2000자)

create index if not exists idx_users_owner_status on users(owner_status);

-- 1-2) 사업자등록증 업로드용 스토리지 버킷 + 정책
--     (place-images, tip-images 버킷과 동일한 방식 — public 버킷 + getPublicUrl 사용)
insert into storage.buckets (id, name, public)
values ('owner-docs', 'owner-docs', true)
on conflict (id) do nothing;

drop policy if exists "owner-docs 누구나 업로드" on storage.objects;
create policy "owner-docs 누구나 업로드"
  on storage.objects for insert
  with check (bucket_id = 'owner-docs');

drop policy if exists "owner-docs 공개 읽기" on storage.objects;
create policy "owner-docs 공개 읽기"
  on storage.objects for select
  using (bucket_id = 'owner-docs');

-- 2) proposals(제보) 테이블에 "사장님 본인 제보" 표시 컬럼 추가
alter table proposals add column if not exists is_owner_request boolean default false;
create index if not exists idx_proposals_owner_request on proposals(is_owner_request);

-- 3) reports(신고) 테이블 — 사장님이 본인 업장 삭제를 요청할 때도 기존 report_category를
--    그대로 씁니다(예: "closed", "no_pets" 등). 별도 컬럼 불필요, 기존 구조 재사용.

-- ── 확인용 ──
-- select owner_status, count(*) from users group by owner_status;
