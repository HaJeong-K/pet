-- ── 사업 성과 지표(관리자 → 성과 지표) 월별 집계 함수 ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 지원사업 중간·최종 보고에 쓰는 월별 지표를 DB 안에서 한 번에 셉니다(데이터가 쌓여도 빠르게).
-- 월 구분은 한국 시간 기준입니다. 서버(service role)만 부를 수 있습니다.

create or replace function kpi_monthly(p_months int default 12)
returns table (
  month text,
  signups bigint,             -- 신규 가입자
  active_users bigint,        -- 월간 활성 사용자(로그인 회원 + 비회원 방문자, 중복 제거)
  page_views bigint,          -- 페이지 조회
  place_views bigint,         -- 장소 상세 조회
  searches bigint,            -- 검색
  course_views bigint,        -- AI 코스 노출
  course_directions bigint,   -- AI 코스에서 길찾기 연결
  bookmarks bigint,           -- 찜
  tips bigint,                -- 장소 제보
  tips_approved bigint,       -- 그중 지도에 등록된 제보
  reviews bigint,             -- 장소 후기(댓글)
  community_posts bigint,     -- 커뮤니티 글
  community_comments bigint,  -- 커뮤니티 댓글
  reports bigint              -- 신고
)
language sql
stable
as $$
  with months as (
    select to_char(date_trunc('month', (now() at time zone 'Asia/Seoul')) - (n || ' month')::interval, 'YYYY-MM') as m
    from generate_series(0, greatest(p_months, 1) - 1) as n
  ),
  ev as (
    select to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM') as m, event_type,
           coalesce(auth_user_id::text, user_key) as who
    from analytics_events
    where created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') - ((greatest(p_months, 1) - 1) || ' month')::interval) at time zone 'Asia/Seoul'
  )
  select
    months.m,
    (select count(*) from users u where to_char(u.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(distinct who) from ev where ev.m = months.m and who is not null),
    (select count(*) from ev where ev.m = months.m and event_type = 'page_view'),
    (select count(*) from ev where ev.m = months.m and event_type = 'place_view'),
    (select count(*) from ev where ev.m = months.m and event_type = 'search'),
    (select count(*) from ev where ev.m = months.m and event_type = 'course_impression'),
    (select count(*) from ev where ev.m = months.m and event_type = 'course_stop_directions'),
    (select count(*) from reactions r where r.type = 'bookmark' and to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from proposals p where to_char(p.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from proposals p where p.status = 'approved' and to_char(p.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from reviews v where coalesce(v.deleted, false) = false and to_char(v.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from community_posts c where coalesce(c.deleted, false) = false and to_char(c.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from community_comments c where coalesce(c.deleted, false) = false and to_char(c.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m),
    (select count(*) from reports x where to_char(x.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = months.m)
  from months
  order by months.m;
$$;

-- 브라우저(익명·로그인 사용자)에서는 부를 수 없게 막고, 서버(service role)만 허용합니다.
revoke execute on function kpi_monthly(int) from public, anon, authenticated;
grant execute on function kpi_monthly(int) to service_role;

-- ── 확인용 ──
-- select * from kpi_monthly(3);
