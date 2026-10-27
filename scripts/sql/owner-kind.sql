-- ── 사장님 유형(가게 / 숙소) — Supabase SQL 편집기에서 그대로 실행하세요 ──
-- 여러 번 실행해도 안전합니다.
--
-- 사장님 가입·전환 화면에서 "가게" / "숙소" 버튼으로 고른 값을 저장합니다(src/lib/ownerKind.ts).
-- 관리자 승인 대기·회원 관리 화면과 관리자 알림에 유형 표시가 붙습니다.
-- 이미 가입한 사장님은 모두 '가게'로 시작합니다.

-- 1) 유형 칸
alter table users add column if not exists owner_kind text not null default 'store';
alter table users drop constraint if exists users_owner_kind_check;
alter table users add constraint users_owner_kind_check check (owner_kind in ('store', 'lodging'));
create index if not exists idx_users_owner_kind on users(owner_kind) where owner_status is not null;

-- 2) 권한 컬럼 보호 트리거에 유형 규칙 추가 (scripts/sql/protect-privileged-columns.sql과 같은 함수)
--    인증이 끝난 사장님은 브라우저에서 유형을 바꿀 수 없습니다 — 바꾸려면 관리자(서버)가 바꿉니다.
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
  if new.owner_kind is distinct from old.owner_kind
     and coalesce(old.owner_status, '') = 'verified' then
    raise exception '권한이 없는 변경입니다 (owner_kind)';
  end if;
  if old.nickname_locked is true and new.nickname_locked is distinct from old.nickname_locked then
    raise exception '권한이 없는 변경입니다 (nickname_locked)';
  end if;
  return new;
end;
$$;

-- ── 확인용 ──
-- select owner_kind, owner_status, count(*) from users where owner_status is not null group by 1, 2;
