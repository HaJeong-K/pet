import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import StayBookClient from "./StayBookClient";
import { db } from "@/lib/server/ownerStore";
import { getLodging } from "@/lib/server/lodgingStore";

// 숙소 예약 화면(/stay/번호/book?room=객실번호) — 덮는 창이 아니라 화면 전체에서 예약합니다.
//   날짜·인원·반려동물 → 요금·환불 일정·예약자·동의 → 완료 (LodgingBookingSheet variant="page")
// 로그인이 필요하고, 예약을 받지 않는 숙소면 장소 상세로 보냅니다.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "숙소 예약 | 같이가개", robots: { index: false } };

export default async function StayBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const [{ id: idText }, { room }] = await Promise.all([params, searchParams]);
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [{ data: place }, lodging] = await Promise.all([
    db.from("places").select("id, name").eq("id", id).maybeSingle<{ id: number; name: string }>(),
    getLodging(id, true).catch(() => null),
  ]);
  if (!place || !lodging?.ready || lodging.rooms.length === 0) redirect(`/place/${id}`);
  const roomId = lodging.rooms.some((r) => r.id === Number(room)) ? Number(room) : lodging.rooms[0].id;
  return <StayBookClient placeId={id} placeName={place.name} profile={lodging.profile} rooms={lodging.rooms} roomId={roomId} />;
}
