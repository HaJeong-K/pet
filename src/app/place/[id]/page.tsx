import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import PlaceDetailClient from "./PlaceDetailClient";

const siteUrl = "https://main.d2ywd3m1zdoku3.amplifyapp.com";
const DEFAULT_IMAGE = "/icons/header_logo_final.png";

// ⚠ SEO/공유 미리보기: 공공데이터 출처 장소(합성 id, places 테이블에 실제 행 없음)는
// 여기서 전국 데이터를 다시 fetch하면 페이지 요청마다 수만 건을 훑게 되어 렌더링
// 목표(3초)에 역행합니다. 그래서 실제 DB 행이 있는 places(사용자 제보·사장님 등록
// 장소)만 풍부한 메타데이터를 만들고, 공공데이터 장소는 사이트 기본 메타데이터로
// 폴백합니다 — 공유가 잦은 쪽은 대부분 실사용자가 등록한 장소이므로 실익이 큽니다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const placeId = Number(id);

  if (Number.isFinite(placeId)) {
    const { data: place } = await supabase
      .from("places")
      .select("name, address, category, pet_zone, image_url")
      .eq("id", placeId)
      .maybeSingle();

    if (place) {
      const title = `${place.name} | 같이가개`;
      const description = place.address
        ? `${place.address} · 반려동물과 함께 갈 수 있는 곳 — 같이가개에서 상세정보를 확인하세요.`
        : "반려동물과 함께 갈 수 있는 곳 — 같이가개에서 상세정보를 확인하세요.";
      const image = place.image_url || DEFAULT_IMAGE;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${siteUrl}/place/${placeId}`,
          siteName: "같이가개",
          images: [{ url: image, alt: place.name }],
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
    title: "장소 상세 | 같이가개",
    description: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
  };
}

export default function PlaceDetailPage() {
  return <PlaceDetailClient />;
}
