import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const siteUrl = "https://main.d2ywd3m1zdoku3.amplifyapp.com";

// ⚠ 공공데이터 출처 장소(문화시설 21,000여 건 등)는 여기 포함하지 않습니다 — sitemap
// 생성 한 번을 위해 전국 데이터를 전량 fetch하면 그 자체가 무거운 작업이고, 검색엔진
// 입장에서도 실사용자가 등록/관리하는 장소(우리 DB places, 커뮤니티 글)가 색인
// 우선순위가 훨씬 높습니다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/community`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${siteUrl}/shelter-notices`, changeFrequency: "daily", priority: 0.6 },
  ];

  const [{ data: places }, { data: posts }] = await Promise.all([
    supabase.from("places").select("id, created_at").order("id", { ascending: false }).limit(2000),
    supabase
      .from("community_posts")
      .select("id, created_at")
      .eq("is_admin_deleted", false)
      .order("id", { ascending: false })
      .limit(2000),
  ]);

  const placeRoutes: MetadataRoute.Sitemap = (places || []).map((p) => ({
    url: `${siteUrl}/place/${p.id}`,
    lastModified: p.created_at ? new Date(p.created_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const postRoutes: MetadataRoute.Sitemap = (posts || []).map((p) => ({
    url: `${siteUrl}/community/post/${p.id}`,
    lastModified: p.created_at ? new Date(p.created_at) : undefined,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...placeRoutes, ...postRoutes];
}
