-- ── 권한 관련 컬럼 보호 + 사장님 자동 인증용 컬럼 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가:
--   users 테이블은 마이페이지 닉네임 변경처럼 브라우저(로그인한 사용자)가 자기 행을 직접 수정합니다.
--   그런데 그 권한으로 is_admin(관리자 여부)·owner_status(사장님 인증 상태)·owner_place_id(수정 권한을
--   갖는 업장)까지 바꿀 수 있으면, 브라우저 개발자 도구만으로 관리자나 "인증된 사장님"이 될 수 있습니다.
--   이 트리거는 그런 컬럼을 서버(service role)만 바꿀 수 있게 막습니다. 일반 사용자는
--     - 사장님 신청 시 owner_status를 '승인 대기(pending)'로 두는 것까지만
--     - 인증 전(pending/rejected) 상태에서만 owner_place_id 지정
--   이 가능하고, 인증 확정(verified)·관리자 지정·자동 인증 표시는 서버 API만 할 수 있습니다.

-- 1) 사장님 자동 인증(국세청 사업자등록 진위확인)에 쓰는 사업자등록번호
alter table users add column if not exists owner_biz_no text default null;
  -- 하이픈 없는 10자리. 같은 사업자번호로 여러 계정이 인증받지 못하게 확인할 때도 씁니다.
create index if not exists idx_users_owner_biz_no on users(owner_biz_no);

-- 2) 권한 컬럼 보호 트리거
create or replace function protect_user_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  -- 서버(service role)·DB 관리자(SQL 편집기)는 제한 없음
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.owner_auto_verified := false;
    if new.owner_status is not null and new.owner_status <> 'pending' then
      new.owner_status := 'pending';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.is_admin is distinct from old.is_admin then
    raise exception '권한이 없는 변경입니다 (is_admin)';
  end if;
  if new.owner_auto_verified is distinct from old.owner_auto_verified then
    raise exception '권한이 없는 변경입니다 (owner_auto_verified)';
  end if;
  if new.owner_status is distinct from old.owner_status
     and not (new.owner_status = 'pending' and coalesce(old.owner_status, '') in ('', 'rejected')) then
    raise exception '권한이 없는 변경입니다 (owner_status)';
  end if;
  if new.owner_place_id is distinct from old.owner_place_id
     and coalesce(new.owner_status, '') = 'verified' then
    raise exception '권한이 없는 변경입니다 (owner_place_id)';
  end if;
  if old.nickname_locked is true and new.nickname_locked is distinct from old.nickname_locked then
    raise exception '권한이 없는 변경입니다 (nickname_locked)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_user_privileged_columns on users;
create trigger trg_protect_user_privileged_columns
  before insert or update on users
  for each row execute function protect_user_privileged_columns();

-- 3) 사업자등록증 버킷 비공개 전환
--    사업자등록증에는 대표자 이름·생년월일 같은 개인정보가 있어 누구나 주소로 열어볼 수 있으면 안 됩니다.
--    공개 읽기를 막고, 관리자 화면은 서버가 10분짜리 임시 주소(signed URL)를 받아 보여줍니다.
--    업로드는 가입 도중(로그인 완료 전)에도 일어나서 기존처럼 허용합니다 — 올린 파일은 아무도 못 읽습니다.
update storage.buckets set public = false where id = 'owner-docs';
drop policy if exists "owner-docs 공개 읽기" on storage.objects;

-- ── 확인용 ──
-- select tgname from pg_trigger where tgname = 'trg_protect_user_privileged_columns';
-- select id, public from storage.buckets where id = 'owner-docs';
