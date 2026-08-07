-- ── 전체 앱 데이터 초기화 (2026-08 공공데이터 3종 재반입 전 클린업) ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 포함: users, places, reviews, review_replies, review_likes, reply_likes,
--       reactions, place_images, reports, proposals, analytics_events,
--       culture_facilities, foodsafety_restaurants,
--       community_posts, community_comments, community_post_likes, community_comment_likes
--
-- 제외(의도적): auth.users — 이메일/비밀번호 로그인 계정 자체는 그대로 둡니다.
--   ⚠ users 테이블은 지워지므로, 각자 로그인 계정(auth.users)은 살아있지만
--   nickname/owner_status(사장님 인증)/owner_place_id 등 프로필 데이터는 함께
--   사라집니다 — 다음 로그인 시 앱이 자동으로 새 프로필 행을 만들지만
--   (KakaoMap.tsx의 createUserProfile), 기존 닉네임·사장님 인증 상태는 복구되지 않습니다.
--
-- TRUNCATE ... CASCADE라 외래키 참조 순서를 신경 안 써도 한 번에 지워지고,
-- RESTART IDENTITY로 id 시퀀스(1, 2, 3...)도 처음부터 다시 시작합니다.
--
-- ⚠ Supabase Storage(place-images / tip-images / owner-docs 버킷의 업로드 파일)는
-- 이 SQL로 안 지워집니다. Storage는 대시보드 → Storage → 버킷별로 전체 선택 후
-- 삭제해주세요(별도 안내드린 대로).

truncate table
  reply_likes,
  review_likes,
  review_replies,
  reviews,
  reactions,
  place_images,
  reports,
  proposals,
  community_comment_likes,
  community_post_likes,
  community_comments,
  community_posts,
  analytics_events,
  culture_facilities,
  foodsafety_restaurants,
  places,
  users
restart identity cascade;

-- ── 확인용 (실행 후 전부 0이 나오면 정상) ──
-- select 'users' t, count(*) from users
-- union all select 'places', count(*) from places
-- union all select 'reviews', count(*) from reviews
-- union all select 'community_posts', count(*) from community_posts;
