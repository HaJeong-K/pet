-- DB 속도 정리 (2026-11-08) — Supabase 성능 점검(Performance Advisor) 결과 반영
-- 화면이 자주 찾는 칸에 색인(찾아보기 표)을 만들고, 똑같은 규칙·색인이 겹쳐 있던 것을 정리합니다.
-- 데이터는 바뀌지 않습니다. 지금은 글이 적어 체감이 작지만, 글·후기가 늘수록 차이가 커집니다.
-- Supabase → SQL Editor에 붙여 넣고 실행하세요(여러 번 실행해도 안전).

-- ① 색인 — 화면이 매번 찾는 칸
create index if not exists idx_reviews_place on public.reviews (place_id, created_at desc);          -- 장소 상세 후기 목록
create index if not exists idx_reviews_author on public.reviews (auth_user_id);                      -- 마이페이지 내 후기·닉네임 맞추기
create index if not exists idx_review_replies_review on public.review_replies (review_id, created_at); -- 후기 답글
create index if not exists idx_review_replies_author on public.review_replies (auth_user_id);
create index if not exists idx_reply_likes_reply on public.reply_likes (reply_id, user_key);          -- 답글 좋아요
create index if not exists idx_community_comments_post on public.community_comments (post_id, created_at); -- 글 상세 댓글
create index if not exists idx_community_comments_author on public.community_comments (author_auth_key);
create index if not exists idx_community_posts_list on public.community_posts (created_at desc) where deleted = false;          -- 커뮤니티 목록(전체)
create index if not exists idx_community_posts_board on public.community_posts (board_id, created_at desc) where deleted = false; -- 게시판별 목록
create index if not exists idx_community_posts_author on public.community_posts (author_auth_key);   -- 내가 쓴 글
create index if not exists idx_community_posts_auth_user on public.community_posts (auth_user_id);
create index if not exists idx_community_saves_post on public.community_saves (post_id);
create index if not exists idx_place_images_place on public.place_images (place_id);
create index if not exists idx_place_reservations_coupon on public.place_reservations (coupon_id);
create index if not exists idx_analytics_events_place on public.analytics_events (place_id, event_type, created_at); -- 사장님 성과 보고서·조회수

-- ② 똑같은 색인 두 개 중 하나 정리(reactions: 같은 칸에 고유 색인이 두 개)
drop index if exists public.reactions_unique;

-- ③ 똑같은 "누구나 읽기" 규칙이 여러 개 겹쳐 있어 매번 모두 검사하던 것 정리(읽기 권한은 그대로)
drop policy if exists "Anyone can view reviews" on public.reviews;
drop policy if exists "allow select reviews" on public.reviews;
drop policy if exists "Allow users to read own reviews" on public.reviews;          -- 누구나 읽기에 이미 포함
drop policy if exists "Allow users to read own replies" on public.review_replies;   -- 누구나 읽기에 이미 포함
drop policy if exists "Users can read own comments" on public.community_comments;   -- 누구나 읽기에 이미 포함
drop policy if exists "Allow users to read own comments" on public.community_comments;

-- 확인: 각 표에 읽기 규칙이 하나씩 남아야 합니다
select tablename, policyname from pg_policies where cmd = 'SELECT' and tablename in ('reviews', 'review_replies', 'community_comments') order by 1;
