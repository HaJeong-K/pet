-- ── 사장님 답글 배지 + 작성자 사칭 방지 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 1) 사장님 답글 배지
--    인증된 사장님이 "자기 가게"의 후기에 답글을 달면 review_replies.is_owner가 true가 되고,
--    화면에 "사장님" 배지가 붙습니다(배달 앱의 사장님 답글과 같은 방식).
--    이 값은 브라우저가 정하지 않고 DB가 직접 판정합니다 — 답글을 쓴 계정이
--    users.owner_status = 'verified' 이고 users.owner_place_id 가 그 후기의 장소일 때만 true.
--    그래서 다른 가게 후기에 단 답글이나 인증 전 계정의 답글에는 배지가 붙지 않습니다.
--
-- 2) 작성자 사칭 방지
--    지금까지는 후기·답글을 저장할 때 브라우저가 보낸 auth_user_id(작성자 계정 번호)를 그대로 믿었습니다.
--    그래서 개발자 도구로 남의 계정 번호를 넣어 저장할 수 있었고, 그대로 두면 사장님 계정 번호를 넣어
--    "사장님 답글"을 흉내 낼 수 있습니다. 이제 DB가 실제 로그인한 계정(auth.uid())으로 덮어씁니다.
--    비회원이 쓴 글은 계정 번호가 비어 있는 채로 저장됩니다(기존과 동일).

alter table review_replies add column if not exists is_owner boolean not null default false;

-- 답글: 작성자 계정 고정 + 사장님 여부 판정
create or replace function stamp_review_reply()
returns trigger
language plpgsql
security definer            -- users 표(일반 사용자는 못 읽음)를 조회해야 해서 정의자 권한으로 실행
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_place text;
begin
  -- 서버(service role)·DB 관리자(SQL 편집기)는 제한 없음
  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.auth_user_id := v_uid;
    select r.place_id::text into v_place from reviews r where r.id = new.review_id;
    new.is_owner := v_uid is not null and v_place is not null and exists (
      select 1 from users u
      where u.auth_user_id = v_uid
        and u.owner_status = 'verified'
        and u.owner_place_id::text = v_place
    );
    return new;
  end if;

  -- UPDATE(내용 수정·좋아요·삭제 표시 등): 작성자와 사장님 표시는 바꿀 수 없음
  new.auth_user_id := old.auth_user_id;
  new.is_owner := old.is_owner;
  return new;
end;
$$;

drop trigger if exists trg_stamp_review_reply on review_replies;
create trigger trg_stamp_review_reply
  before insert or update on review_replies
  for each row execute function stamp_review_reply();

-- 후기: 작성자 계정 고정
create or replace function stamp_review_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.auth_user_id := auth.uid();
  else
    new.auth_user_id := old.auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_review_author on reviews;
create trigger trg_stamp_review_author
  before insert or update on reviews
  for each row execute function stamp_review_author();

-- ── 확인용 ──
-- select tgname from pg_trigger where tgname in ('trg_stamp_review_reply', 'trg_stamp_review_author');
-- select count(*) from review_replies where is_owner;
