-- ── 댓글·후기·커뮤니티 글 자동 필터(금칙어·스팸) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 글은 브라우저가 DB에 직접 저장하므로, 필터를 DB 트리거에 둬야 브라우저를 조작해도 우회할 수 없습니다.
-- 걸리면 저장이 거절되고 화면에 이유("부적절한 표현이 포함돼 있어요" 등)가 뜹니다.
--
-- 금칙어는 moderation_words 표로 관리합니다 — 코드 수정 없이 Supabase 표 편집 화면에서 추가·삭제하세요.
--   kind = 'block'  : 띄어쓰기·숫자·기호를 끼워 넣어도(예: "ㅅ ㅂ", "씨1발") 걸러냅니다.
--   kind = 'allow'  : 금칙어를 포함하지만 정상인 단어(예: "시발점") — 검사 전에 지우고 봅니다.
--   kind = 'spam'   : 홍보·도박 등 스팸 표현.

create table if not exists moderation_words (
  word text primary key,
  kind text not null check (kind in ('block', 'allow', 'spam')),
  created_at timestamptz default now()
);
alter table moderation_words enable row level security;  -- 브라우저에서 목록을 읽거나 고치지 못하게(정책 없음 = 서버·관리자만)

insert into moderation_words (word, kind) values
  -- 욕설·비하
  ('씨발','block'),('씨바','block'),('시발','block'),('쉬발','block'),('ㅅㅂ','block'),('ㅆㅂ','block'),
  ('병신','block'),('ㅂㅅ','block'),('ㅄ','block'),('좆','block'),('존나','block'),('졸라','block'),
  ('개색기','block'),('지랄','block'),('ㅈㄹ','block'),
  ('느금마','block'),('니애미','block'),('엠창','block'),('썅','block'),('닥쳐','block'),
  -- 정상 단어 예외
  -- (반려동물 커뮤니티라 "새끼(강아지·고양이 새끼)", "개 새끼(개의 새끼)"는 일상어라 금칙어에서 뺐습니다.
  --  "꺼져"도 "불이 꺼져요"처럼 흔히 쓰여 뺐습니다.)
  ('시발점','allow'),('시발역','allow'),('시발택시','allow'),
  -- 스팸·홍보
  ('토토사이트','spam'),('카지노사이트','spam'),('바카라','spam'),('슬롯사이트','spam'),('먹튀검증','spam'),
  ('스포츠토토','spam'),('불법도박','spam'),('대출문의','spam'),('작업대출','spam')
on conflict (word) do nothing;

-- ⚠ security definer: 글을 쓰는 사용자 권한으로 돌면 금칙어 표(브라우저 열람 차단)가 비어 보여서
--    아무것도 걸러내지 못합니다. 함수 소유자 권한으로 표를 읽게 하고, search_path를 고정해 안전하게 둡니다.
create or replace function moderate_text(p_text text)
returns text      -- 문제 없으면 null, 걸리면 사용자에게 보여줄 이유
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  norm text;
  w record;
  url_count int;
begin
  if p_text is null or length(p_text) = 0 then return null; end if;

  -- 링크가 3개 이상이면 홍보 글로 봅니다.
  select count(*) into url_count from regexp_matches(p_text, 'https?://', 'g');
  if url_count >= 3 then
    return '링크가 너무 많아요. 링크는 2개까지 넣을 수 있어요.';
  end if;

  -- 띄어쓰기·숫자·기호를 지우고 소문자로 맞춘 뒤 검사합니다("씨 1 발" → "씨발").
  norm := lower(regexp_replace(p_text, '[[:space:][:punct:][:digit:]]+', '', 'g'));
  for w in select word from moderation_words where kind = 'allow' loop
    norm := replace(norm, w.word, '');
  end loop;

  for w in select word, kind from moderation_words where kind in ('spam', 'block') order by kind desc loop
    if position(w.word in norm) > 0 then
      if w.kind = 'spam' then
        return '홍보·광고로 보이는 내용이 있어 등록할 수 없어요.';
      end if;
      return '부적절한 표현이 포함돼 있어요. 고운 말로 다시 써 주세요.';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function moderate_content_trigger()
returns trigger
language plpgsql
as $$
declare
  reason text;
  combined text;
begin
  -- 서버(service role)·관리자 SQL은 검사하지 않습니다(관리자 수정·데이터 이관 등).
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  combined := coalesce(to_jsonb(new)->>'title', '') || ' ' || coalesce(to_jsonb(new)->>'content', '')
              || ' ' || coalesce(to_jsonb(new)->>'nickname', '');
  reason := moderate_text(combined);
  if reason is not null then
    raise exception '%', reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 글 내용이 새로 들어오거나 바뀔 때만 검사합니다(좋아요 수 갱신 같은 다른 변경은 통과).
do $$
declare t text;
begin
  foreach t in array array['reviews', 'review_replies', 'community_posts', 'community_comments'] loop
    execute format('drop trigger if exists trg_moderate_content on %I', t);
    execute format(
      'create trigger trg_moderate_content before insert or update of content%s on %I
         for each row execute function moderate_content_trigger()',
      case when t = 'community_posts' then ', title' else '' end, t);
  end loop;
end $$;

-- ── 확인용 ──
-- select moderate_text('정말 좋은 곳이에요');   -- null(통과)
-- select moderate_text('씨 1 발 별로');           -- 부적절한 표현
-- select moderate_text('여기가 시발점이에요');    -- null(예외 단어)
