import type { Metadata } from "next";
import PlaceDetailClient from "./PlaceDetailClient";
import { siteUrl } from "@/lib/siteUrl";
import { getPlaceMeta, placeShareDescription, placeShareImage } from "@/lib/server/placeMeta";

// SEO/공유 미리보기: 직접 등록·제보된 장소와 공공데이터 장소 모두 이름·주소·분류가 담긴 미리보기를
// 만듭니다. 사진이 있으면 그 사진을, 없으면 서버가 그린 카드(/api/og/place/[id])를 씁니다.
// (예전엔 공공데이터 장소는 전국 데이터를 다시 받아야 해서 사이트 기본 문구로만 나왔습니다 —
//  이제 스냅샷 캐시에서 바로 찾습니다. src/lib/server/placeMeta.ts)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = await getPlaceMeta(id);

  if (meta) {
    const title = `${meta.name} | 같이가개`;
    const description = placeShareDescription(meta);
    const image = placeShareImage(meta);
    return {
      title,
      description,
      alternates: { canonical: `${siteUrl}/place/${meta.id}` },
      openGraph: {
        title,
        description,
        url: `${siteUrl}/place/${meta.id}`,
        siteName: "같이가개",
        images: [{ url: image, alt: meta.name, ...(meta.photo ? {} : { width: 1200, height: 630 }) }],
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

  return {
    title: "장소 상세 | 같이가개",
    description: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
  };
}

export default function PlaceDetailPage() {
  return <PlaceDetailClient />;
}
