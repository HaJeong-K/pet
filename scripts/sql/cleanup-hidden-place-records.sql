-- ── 이미 숨김/삭제 처리된 장소의 남은 기록 일괄 정리 (1회성) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다(이미 지워진 건 0건
-- 삭제로 그냥 넘어갑니다).
--
-- 배경: 이번 업데이트 전까지는 관리자가 장소를 "삭제/숨김" 처리해도 리뷰·좋아요·
-- 이미지·반응·통계(analytics_events) 기록은 그대로 남아있었고, 통계 분석 탭의
-- hidden_public_places 필터도 place_id 타입 불일치(text vs number) 버그로 제대로
-- 걸러내지 못하고 있었습니다(코드는 함께 수정했습니다). 이 스크립트는 지금까지
-- hidden_public_places에 이미 올라가 있는 장소들의 남은 기록을 한 번에 정리합니다.
--
-- 앞으로는 장소를 삭제/숨김 처리할 때 서버(src/lib/purgePlaceRecords.ts)가 자동으로
-- 같은 정리를 해주므로, 이 스크립트는 "지금까지 쌓인 것"만 한 번 청소하면 됩니다.

-- ── 1. 답글 좋아요 (숨김 장소 리뷰의 답글에 달린 좋아요)
delete from reply_likes
where reply_id in (
  select rr.id from review_replies rr
  join reviews r on r.id = rr.review_id
  where r.place_id in (select place_id from hidden_public_places)
);

-- ── 2. 답글 / 리뷰 좋아요
delete from review_replies
where review_id in (
  select id from reviews where place_id in (select place_id from hidden_public_places)
);

delete from review_likes
where review_id in (
  select id from reviews where place_id in (select place_id from hidden_public_places)
);

-- ── 3. 리뷰 본체
delete from reviews
where place_id in (select place_id from hidden_public_places);

-- ── 4. 이미지 / 반응(좋아요·싫어요·북마크)
delete from place_images
where place_id in (select place_id from hidden_public_places);

delete from reactions
where place_id in (select place_id from hidden_public_places);

-- ── 5. 통계 이벤트 (analytics_events.place_id는 text 컬럼입니다)
delete from analytics_events
where place_id in (select place_id::text from hidden_public_places);

-- ── 6. 신고는 감사 목적상 삭제 대신 처리 완료로만 표시
update reports
set is_resolved = true
where place_id in (select place_id from hidden_public_places);
