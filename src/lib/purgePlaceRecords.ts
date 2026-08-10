// src/lib/purgePlaceRecords.ts
//
// 장소를 삭제하거나(실제 places 행) 숨기거나(공공데이터 합성 id) 할 때, 그 장소에 딸린
// 모든 "기록"을 함께 정리하는 공용 로직입니다. 원래는 delete-place 라우트 안에만 있던
// 리뷰 계단식 삭제 로직을, hide-public-place(공공데이터 숨김)·delete-public-data-place
// (CSV 출처 장소 완전 삭제) 라우트에서도 똑같이 써야 해서 이 파일로 뽑았습니다.
//
// ⚠ 관리자 통계 분석 탭(/admin/analytics)의 "지역별 인기 장소"는 analytics_events의
// place_view 이벤트를 집계합니다. 예전엔 장소를 지워도 analytics_events 행은 그대로
// 남아있었고, /api/admin/analytics가 런타임에 "이미 없어진 장소"를 걸러내는 필터만
// 있었습니다(그마저도 place_id 타입 불일치로 제대로 동작하지 않는 버그가 있었습니다 —
// 별도로 수정). 이제는 삭제/숨김 시점에 analytics_events를 포함한 모든 관련 기록을
// 실제로 지워서, 통계에 아예 남지 않도록 합니다.
//
// 리뷰/좋아요/이미지/반응은 장소가 실제 places 행이든 공공데이터 합성 id든 동일하게
// place_id 컬럼(정수, FK 제약 없음)만 보고 저장되므로 두 경우 모두 같은 방식으로
// 정리할 수 있습니다. 신고(reports)는 감사(audit) 목적상 삭제 대신 기존처럼
// is_resolved=true로만 처리합니다.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function purgePlaceRecords(supabaseAdmin: SupabaseClient, placeId: number) {
  // ── 1. 리뷰 ID 목록 조회 → 답글/좋아요까지 계단식으로 정리
  const { data: reviews } = await supabaseAdmin
    .from("reviews")
    .select("id")
    .eq("place_id", placeId);

  const reviewIds = (reviews || []).map((r: any) => r.id);

  if (reviewIds.length > 0) {
    const { data: replyRows } = await supabaseAdmin
      .from("review_replies")
      .select("id")
      .in("review_id", reviewIds);

    const replyIds = (replyRows || []).map((r: any) => r.id);

    if (replyIds.length > 0) {
      await supabaseAdmin.from("reply_likes").delete().in("reply_id", replyIds);
    }

    await Promise.all([
      supabaseAdmin.from("review_replies").delete().in("review_id", reviewIds),
      supabaseAdmin.from("review_likes").delete().in("review_id", reviewIds),
    ]);
  }

  // ── 2. 장소 관련 나머지 기록 정리
  // analytics_events.place_id는 text 컬럼이라 String으로 맞춰서 지웁니다
  // (src/lib/analytics.ts trackEvent가 String(placeId)로 저장).
  await Promise.all([
    supabaseAdmin.from("reviews").delete().eq("place_id", placeId),
    supabaseAdmin.from("place_images").delete().eq("place_id", placeId),
    supabaseAdmin.from("reactions").delete().eq("place_id", placeId),
    supabaseAdmin.from("analytics_events").delete().eq("place_id", String(placeId)),
    supabaseAdmin.from("reports").update({ is_resolved: true }).eq("place_id", placeId),
  ]);
}
