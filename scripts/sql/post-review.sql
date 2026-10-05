-- ── 커뮤니티 글 자동 검토(게시판 규칙 위반 의심 → 관리자 확인 후 게시) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 욕설·도박 스팸은 content-moderation.sql이 저장 자체를 막습니다. 이 파일은 그보다 애매한 경우,
-- 즉 "게시판 성격에 맞지 않는 글"을 다룹니다 — 나눔 게시판의 판매 글, 유기동물 게시판의 유료 분양,
-- 일반 게시판의 광고·홍보 등. 이런 글은 저장은 하되 바로 공개하지 않고 "검토 대기"로 두었다가,
-- 관리자가 확인해 승인하면 게시됩니다(잘못 걸린 정상 글을 살릴 수 있도록 막지 않고 보류).
--
--   review_status = 'visible'  : 공개(기본)
--                 = 'pending'  : 자동 감지돼 관리자 확인을 기다리는 중(작성자와 관리자만 볼 수 있음)
--                 = 'rejected' : 관리자가 반려(공개되지 않음)
--
-- 감지 규칙은 moderation_rules 표로 관리합니다 — 코드 수정 없이 Supabase 표 편집 화면에서 추가·끄기 가능.
--   board_id : 규칙을 적용할 게시판. 비워 두면(null) 사장님 게시판을 뺀 모든 게시판에 적용
--   except_boards : (board_id가 비어 있을 때) 이 규칙을 적용하지 않을 게시판 목록
--   pattern  : 찾을 표현(정규식, 대소문자 구분 없음)
--   reason   : 관리자·작성자에게 보여 줄 사유
-- 글은 브라우저가 DB에 직접 저장하므로, 판정을 DB 트리거에 둬야 브라우저를 조작해도 우회할 수 없습니다.

alter table community_posts add column if not exists review_status text not null default 'visible';
alter table community_posts add column if not exists review_reason text;
alter table community_posts add column if not exists review_notified_at timestamptz;  -- 관리자 알림을 보낸 시각(중복 알림 방지)
do $$ begin
  alter table community_posts add constraint community_posts_review_status_check check (review_status in ('visible', 'pending', 'rejected'));
exception when duplicate_object then null; end $$;
create index if not exists idx_community_posts_review on community_posts(review_status) where review_status <> 'visible';

create table if not exists moderation_rules (
  id bigserial primary key,
  board_id text,
  pattern text not null,
  reason text not null,
  enabled boolean not null default true,
  created_at timestamptz default now()
);
create unique index if not exists idx_moderation_rules_unique on moderation_rules(coalesce(board_id, ''), pattern);
alter table moderation_rules add column if not exists except_boards text[] not null default '{}';
alter table moderation_rules enable row level security;  -- 브라우저에서 규칙을 읽거나 고치지 못하게(정책 없음 = 서버·관리자만)

insert into moderation_rules (board_id, pattern, reason) values
  -- 나눔: 돈을 받는 판매
  ('share', '(판매|팝니다|팔아요|팔게요|팝니당|급처|네고|가격\s*제시|얼마에|[0-9][0-9,\.]*\s*(천|만)?\s*원에)', '나눔 게시판의 판매 의심'),
  ('share', '(계좌|입금|송금|선입금|안전\s*결제|번개\s*페이|중고\s*나라)', '나눔 게시판의 금전 거래 의심'),
  ('share', '(강아지|고양이|새끼|아이)\s*(를|들)?\s*(분양|팝|팔)', '나눔 게시판의 동물 거래 의심'),
  -- 유기동물: 유료 분양·교배
  ('rescue', '(분양\s*가|분양\s*비|책임\s*비|입양\s*비|[0-9][0-9,\.]*\s*만\s*원)', '유기동물 게시판의 금전 요구 의심'),
  ('rescue', '(교배|브리더|켄넬\s*분양|전문\s*견사|혈통서|가정\s*분양\s*합니다)', '유기동물 게시판의 분양·교배 홍보 의심'),
  -- 일반 게시판 공통(사장님 게시판 제외): 광고·홍보
  (null, '(010|011|016|017|018|019)\s*[-.]?\s*[0-9]{3,4}\s*[-.]?\s*[0-9]{4}', '전화번호가 포함된 글(광고·개인정보 의심)'),
  (null, '(오픈\s*채팅|오픈\s*톡|카톡\s*(아이디|id|ID)|카카오톡\s*(아이디|id|ID)|텔레그램|라인\s*(아이디|id))', '메신저 연락처 유도(광고 의심)'),
  (null, '(스마트\s*스토어|스토어팜|쿠팡\s*파트너스|공구\s*진행|공동\s*구매|최저가|할인\s*코드|쿠폰\s*코드|체험단|협찬|원고료)', '상품 판매·홍보 의심'),
  (null, '(문의\s*(주세요|환영|바랍니다)|예약\s*(문의|환영)|상담\s*환영|방문\s*상담|가격\s*문의|무료\s*상담)', '영업·홍보 의심'),
  (null, '(오픈\s*(이벤트|기념)|이벤트\s*진행\s*중|특가|세일\s*중|[0-9]+\s*%\s*할인)', '업체 홍보 의심'),
  -- 후기: 대가를 받은 글
  ('review', '(제공\s*받아|지원\s*받아|소정의|무상\s*제공|광고\s*포함)', '대가성 후기 의심')
on conflict do nothing;

-- 실종·목격 글은 연락처가 꼭 필요하고 급한 글이라, 유기동물 게시판에서는 전화번호 규칙을 적용하지 않습니다.
update moderation_rules set except_boards = array['rescue']
  where board_id is null and reason = '전화번호가 포함된 글(광고·개인정보 의심)' and except_boards = '{}';

-- 게시판과 글 내용으로 검토 사유를 찾습니다(없으면 null).
-- ⚠ security definer: 글 쓰는 사용자 권한으로는 규칙 표(브라우저 열람 차단)가 비어 보이므로 함수 소유자 권한으로 읽습니다.
create or replace function review_reason_for(p_board text, p_text text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_text is null or btrim(p_text) = '' then return null; end if;
  for r in
    select pattern, reason from moderation_rules
    where enabled
      and (board_id = p_board or (board_id is null and coalesce(p_board, '') <> 'business' and not (coalesce(p_board, '') = any(except_boards))))
    order by (board_id is null), id   -- 그 게시판 전용 규칙을 먼저
  loop
    begin
      if p_text ~* r.pattern then return r.reason; end if;
    exception when others then
      continue;  -- 잘못 적힌 정규식 하나 때문에 글쓰기 전체가 막히지 않게
    end;
  end loop;
  return null;
end;
$$;

create or replace function review_post_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  -- 서버(service role)·DB 관리자(SQL 편집기)는 제한 없음 — 관리자 승인·반려가 이 경로로 들어옵니다.
  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_reason := review_reason_for(new.board_id, coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
    new.review_status := case when v_reason is null then 'visible' else 'pending' end;
    new.review_reason := v_reason;
    new.review_notified_at := null;
    return new;
  end if;

  -- UPDATE: 일반 사용자는 검토 상태를 직접 바꿀 수 없습니다(브라우저에서 'visible'로 되돌리는 시도 차단).
  new.review_status := old.review_status;
  new.review_reason := old.review_reason;
  new.review_notified_at := old.review_notified_at;
  -- 제목·내용·게시판을 고치면 다시 검사합니다. 걸리면 검토 대기로 돌리고,
  -- 이미 검토 대기·반려인 글은 고쳐도 자동으로 풀리지 않습니다(관리자가 확인).
  if new.title is distinct from old.title or new.content is distinct from old.content or new.board_id is distinct from old.board_id then
    v_reason := review_reason_for(new.board_id, coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
    if v_reason is not null and old.review_status = 'visible' then
      new.review_status := 'pending';
      new.review_reason := v_reason;
      new.review_notified_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_review_post on community_posts;
create trigger trg_review_post
  before insert or update on community_posts
  for each row execute function review_post_trigger();

-- ── 확인용 ──
-- select review_reason_for('share', '사료 5천원에 팝니다');          -- → 나눔 게시판의 판매 의심
-- select review_reason_for('share', '안 쓰는 하네스 무료로 나눔해요');  -- → null
-- select id, title, review_status, review_reason from community_posts where review_status <> 'visible';
