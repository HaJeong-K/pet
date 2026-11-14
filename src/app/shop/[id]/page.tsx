import type { Metadata } from "next";
import { siteUrl } from "@/lib/siteUrl";
import { db } from "@/lib/server/ownerStore";
import ShopStoreClient from "./ShopStoreClient";

// ── 쇼핑 가게 화면(/shop/번호) ── 배달 앱의 가게 화면처럼 가게 정보와 전체 메뉴를 한 번에 보여 줍니다.

// 가게 이름·주소(검색 결과 제목과 검색엔진용 정보에 씁니다). 못 읽으면 기본 제목으로.
async function storeOf(idText: string) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const { data } = await db.from("places").select("id, name, address, phone, image_url, lat, lng, category").eq("id", id).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = await storeOf(id);
  const title = store?.name ? `${store.name} 메뉴·미리 주문 | 펫츠로드` : "가게 메뉴 | 펫츠로드";
  const description = store?.name ? `${store.name} — 반려동물 간식·용품을 미리 결제하고 포장하거나 매장 식사를 예약하세요.` : undefined;
  return { title, description, alternates: { canonical: `${siteUrl}/shop/${id}` }, openGraph: { title, description, url: `${siteUrl}/shop/${id}`, siteName: "펫츠로드", locale: "ko_KR", type: "website" } };
}

export default async function ShopStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const placeId = Number(id);
  const store = await storeOf(id);
  const photo = typeof store?.image_url === "string" && !store.image_url.includes("default-place") ? store.image_url : null;
  const jsonLd = store?.name ? {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    url: `${siteUrl}/shop/${placeId}`,
    ...(store.address ? { address: { "@type": "PostalAddress", streetAddress: store.address, addressCountry: "KR" } } : {}),
    ...(store.phone ? { telephone: store.phone } : {}),
    ...(photo ? { image: photo } : {}),
    ...(store.lat != null && store.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: Number(store.lat), longitude: Number(store.lng) } } : {}),
  } : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <ShopStoreClient placeId={placeId} />
    </>
  );
}
