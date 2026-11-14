import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import StayDetailClient, { type StayPlace } from "./StayDetailClient";
import { db } from "@/lib/server/ownerStore";
import { getLodging } from "@/lib/server/lodgingStore";
import { siteUrl } from "@/lib/siteUrl";
import { roomLowestPrice } from "@/lib/lodgingRules";

// 숙소 화면(/stay/번호) — 펫츠로드에 입점해 바로 예약되는 숙소의 숙박 앱식 화면입니다.
//   사진 · 이름·별점 · 객실(→ /stay/번호/book) · 동반 조건 · 숙박 후기(별점) · 위치
// 장소 상세(친화도 점수 등)는 보여 주지 않습니다. 예약을 받지 않는 숙소면 장소 상세(/place/번호)로 보냅니다.

export const dynamic = "force-dynamic";

async function load(idText: string) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [{ data: place }, lodging] = await Promise.all([
    db.from("places").select("*").eq("id", id).maybeSingle<Record<string, any>>(),
    getLodging(id, true).catch(() => null),
  ]);
  if (!place) return { id, place: null, lodging };
  const photo = typeof place.image_url === "string" && place.image_url && !place.image_url.includes("default-place") ? place.image_url : null;
  const stay: StayPlace = {
    id, name: place.name, address: place.address ?? null, category: place.category ?? null, phone: place.phone ?? null, photo,
    lat: place.lat ?? null, lng: place.lng ?? null,
    premium: !!place.is_premium && !!place.premium_expires_at && new Date(place.premium_expires_at).getTime() > Date.now(),
  };
  return { id, place: stay, lodging };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data?.place) return { title: "숙소 | 펫츠로드" };
  const title = `${data.place.name} 예약 | 펫츠로드`;
  const description = `${data.place.name} — 반려동물 동반 조건을 확인하고 펫츠로드에서 바로 예약하세요.`;
  return { title, description, alternates: { canonical: `${siteUrl}/stay/${data.id}` }, openGraph: { title, description, url: `${siteUrl}/stay/${data.id}`, siteName: "펫츠로드", locale: "ko_KR", type: "website" } };
}

export default async function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  if (!data.place || !data.lodging?.ready || data.lodging.rooms.length === 0) redirect(`/place/${data.id}`);
  // 검색엔진용 정보(구글·네이버가 숙소로 알아보게) — 이름·주소·전화·사진·좌표·반려동물 동반·가격대
  const prices = data.lodging.rooms.map(roomLowestPrice).filter((n) => Number.isFinite(n) && n > 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: data.place.name,
    url: `${siteUrl}/stay/${data.id}`,
    petsAllowed: true,
    ...(data.place.address ? { address: { "@type": "PostalAddress", streetAddress: data.place.address, addressCountry: "KR" } } : {}),
    ...(data.place.phone ? { telephone: data.place.phone } : {}),
    ...(data.place.photo ? { image: data.place.photo } : {}),
    ...(data.place.lat != null && data.place.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: Number(data.place.lat), longitude: Number(data.place.lng) } } : {}),
    ...(prices.length ? { priceRange: `${Math.min(...prices).toLocaleString("ko-KR")}원~` } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <StayDetailClient place={data.place} profile={data.lodging.profile} rooms={data.lodging.rooms} />
    </>
  );
}
