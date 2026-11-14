import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/siteUrl";
import { AREAS } from "@/lib/areaPages";

// ⚠ 공공데이터 출처 장소(문화시설 21,000여 건 등)는 여기 포함하지 않습니다 — sitemap
// 생성 한 번을 위해 전국 데이터를 전량 fetch하면 그 자체가 무거운 작업이고, 검색엔진
// 입장에서도 실사용자가 등록/관리하는 장소(우리 DB places, 커뮤니티 글)가 색인
// 우선순위가 훨씬 높습니다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/community`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${siteUrl}/shelter-notices`, changeFrequency: "daily", priority: 0.6 },
    // 2026-11-13 보강: 숙소·쇼핑·고객센터·입점 안내·지역별 페이지
    { url: `${siteUrl}/stay`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/shop`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/help`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/partner/lodging`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/partner/store`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/partnership`, changeFrequency: "monthly", priority: 0.4 },
    ...AREAS.map((a) => ({ url: `${siteUrl}/area/${a.id}`, changeFrequency: "daily" as const, priority: 0.8 })),
  ];

  // 바로 예약되는 숙소 화면(/stay/번호) — 객실을 올린 숙소만. 서버 권한으로 읽고, 표가 없거나 실패하면 건너뜁니다.
  let stayRoutes: MetadataRoute.Sitemap = [];
  try {
    const { db } = await import("@/lib/server/ownerStore");
    const { data: rooms } = await db.from("lodging_rooms").select("place_id").limit(5000);
    stayRoutes = [...new Set((rooms ?? []).map((r) => Number(r.place_id)))].map((id) => ({ url: `${siteUrl}/stay/${id}`, changeFrequency: "daily" as const, priority: 0.8 }));
  } catch { /* 숙소 표를 못 읽으면 숙소 화면만 빠집니다 */ }

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

  return [...staticRoutes, ...stayRoutes, ...placeRoutes, ...postRoutes];
}
