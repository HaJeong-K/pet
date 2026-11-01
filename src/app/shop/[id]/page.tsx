import type { Metadata } from "next";
import { siteUrl } from "@/lib/siteUrl";
import ShopStoreClient from "./ShopStoreClient";

// ── 쇼핑 가게 화면(/shop/번호) ── 배달 앱의 가게 화면처럼 가게 정보와 전체 메뉴를 한 번에 보여 줍니다.

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: "가게 메뉴 | 펫츠로드", alternates: { canonical: `${siteUrl}/shop/${id}` } };
}

export default async function ShopStorePage({ params }: { params: Promise<{ id: string }> }) {
  const placeId = Number((await params).id);
  return <ShopStoreClient placeId={placeId} />;
}
