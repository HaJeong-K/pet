"use client";

// 숙소 예약 화면의 손님 쪽 — 로그인을 확인하고 예약 단계(LodgingBookingSheet)를 화면에 그대로 그립니다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StayFrame from "@/components/lodging/StayFrame";
import LodgingBookingSheet, { type GuestRoom } from "@/components/lodging/LodgingBookingSheet";
import LogoLoader from "@/components/LogoLoader";
import { supabase } from "@/lib/supabase";
import type { LodgingProfile } from "@/lib/lodgingRules";

export default function StayBookClient({ placeId, placeName, profile, rooms, roomId }: {
  placeId: number; placeName: string; profile: LodgingProfile | null; rooms: GuestRoom[]; roomId: number;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace(`/login?redirect=${encodeURIComponent(`/stay/${placeId}/book?room=${roomId}`)}`);
      else setReady(true);
    });
  }, [router, placeId, roomId]);

  const back = () => router.push(`/stay/${placeId}`);
  return (
    <StayFrame>
      <div>
        <div>
          {ready
            ? <LodgingBookingSheet variant="page" placeName={placeName} profile={profile} rooms={rooms} initialRoomId={roomId} onClose={back} />
            : <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>}
        </div>
      </div>
    </StayFrame>
  );
}
