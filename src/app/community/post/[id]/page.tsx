import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import CommunityPostClient from "./CommunityPostClient";

const siteUrl = "https://main.d2ywd3m1zdoku3.amplifyapp.com";
const DEFAULT_IMAGE = "/icons/header_logo_final.png";

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
      const title = `${post.title} | 같이가개 커뮤니티`;
      const description =
        (post.content || "").slice(0, 100).replace(/\s+/g, " ").trim() ||
        "반려동물 동반 지역 커뮤니티 — 같이가개";
      const image = post.image_urls?.[0] || DEFAULT_IMAGE;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/community/post/${postId}`,
          siteName: "같이가개",
          images: [{ url: image, alt: post.title }],
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
    title: "커뮤니티 게시글 | 같이가개",
    description: "반려동물 동반 지역 커뮤니티 — 같이가개",
  };
}

export default function CommunityPostPage() {
  return <CommunityPostClient />;
}
