import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import CommunityPostClient from "./CommunityPostClient";
import { siteUrl } from "@/lib/siteUrl";

// 사진이 없는 글을 공유했을 때 보이는 그림(사이트 기본 공유 그림과 같음)
const DEFAULT_IMAGE = "/og-default.png";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const postId = Number(id);

  if (Number.isFinite(postId)) {
    const { data: post } = await supabase
      .from("community_posts")
      .select("title, content, image_urls, is_admin_deleted")
      .eq("id", postId)
      .maybeSingle();

    if (post && !post.is_admin_deleted) {
      const title = `${post.title} | 펫츠로드 커뮤니티`;
      const description =
        (post.content || "").slice(0, 100).replace(/\s+/g, " ").trim() ||
        "반려동물 동반 지역 커뮤니티 — 펫츠로드";
      const image = post.image_urls?.[0] || DEFAULT_IMAGE;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/community/post/${postId}`,
          siteName: "펫츠로드",
          // 기본 공유 그림은 크기를 함께 알려 줘야 메신저가 가운데만 잘라 보여 주지 않습니다
          images: [{ url: image, alt: post.title, ...(image === DEFAULT_IMAGE ? { width: 1200, height: 630 } : {}) }],
          locale: "ko_KR",
          type: "article",
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [image],
        },
      };
    }
  }

  return {
    title: "커뮤니티 게시글 | 펫츠로드",
    description: "반려동물 동반 지역 커뮤니티 — 펫츠로드",
  };
}

export default function CommunityPostPage() {
  return <CommunityPostClient />;
}
