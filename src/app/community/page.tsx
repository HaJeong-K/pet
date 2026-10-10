import CommunityClient, { type CommunityInitial } from "./CommunityClient";
import { supabase } from "@/lib/supabase";

// ⚠ 속도: 예전에는 빈 화면을 먼저 보내고, 브라우저가 준비된 뒤에야 글 목록을 받아 왔습니다(폰에서 2초 넘게 걸림).
// 이제 서버가 첫 목록(전체 게시판 1쪽 + 공지)을 화면에 채워서 보냅니다 — 화면이 뜨는 순간 글이 보입니다.
// 이 화면은 30초마다 새로 만들어 두고(그 사이에는 만들어 둔 것을 그대로 보냄), 브라우저는 화면을 띄운 뒤
// 최신 목록을 한 번 더 받아 바뀐 것이 있으면 바꿉니다(CommunityClient). 그래서 방금 쓴 글도 곧바로 보입니다.
export const revalidate = 30;

const PAGE_SIZE = 15;

async function loadInitial(): Promise<CommunityInitial | null> {
  try {
    // 목록 조건은 CommunityClient의 "전체 게시판 · 1쪽 · 검색 없음"과 같습니다.
    const runList = async (withReview: boolean) => {
      let q = supabase
        .from("community_posts")
        .select("id, title, content, nickname, avatar_url, created_at, likes, comment_count, views, board_id, post_type, image_urls, deleted, is_admin_deleted", { count: "exact" })
        .eq("is_notice", false)
        .eq("deleted", false)
        .eq("is_admin_deleted", false);
      if (withReview) q = q.eq("review_status", "visible");
      return await q.order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1);
    };
    const [first, noticeResult] = await Promise.all([
      runList(true),
      supabase.from("community_posts").select("id, title, nickname, created_at, board_id").eq("is_notice", true).order("created_at", { ascending: false }).limit(5),
    ]);
    const listResult = first.error ? await runList(false) : first;
    if (listResult.error) throw new Error(listResult.error.message);
    const posts = listResult.data || [];

    // 댓글·좋아요 수는 저장된 숫자 대신 실제 개수를 셉니다(CommunityClient와 같은 보정).
    const commentCount: Record<string, number> = {};
    const likeCount: Record<string, number> = {};
    if (posts.length > 0) {
      const ids = posts.map((p) => p.id);
      const [{ data: commentRows }, { data: likeRows }] = await Promise.all([
        supabase.from("community_comments").select("post_id").eq("deleted", false).in("post_id", ids),
        supabase.from("community_post_likes").select("post_id").in("post_id", ids),
      ]);
      (commentRows || []).forEach((c) => { commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1; });
      (likeRows || []).forEach((l) => { likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1; });
    }
    return {
      posts: posts.map((p) => ({ ...p, comment_count: commentCount[p.id] ?? p.comment_count ?? 0, likes: likeCount[p.id] ?? p.likes ?? 0 })),
      totalCount: listResult.count ?? 0,
      notices: noticeResult.data || [],
      generatedAt: Date.now(),
    };
  } catch (e) {
    console.error("[community] 첫 목록 준비 실패:", e);
    // 운영 중에 화면을 새로 만들다 실패하면 오류를 내서 "직전에 만든 화면"을 계속 보여 줍니다(빈 화면으로 덮어쓰지 않음).
    // 배포할 때(빌드)만 빈 채로 만들어 두고, 브라우저가 예전처럼 직접 받습니다.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw e;
    return null;
  }
}

export default async function CommunityPage() {
  // 이 화면은 뒤에서 미리 만들어 두는 것이라(30초마다), 시간 제한 없이 끝까지 받아서 만듭니다.
  const initial = await loadInitial();
  return <CommunityClient initial={initial} />;
}
