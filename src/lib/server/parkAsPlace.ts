// src/lib/server/parkAsPlace.ts
//
// 공원 장소 번호(90억 이상, src/lib/parkPlace.ts)로 공원 한 곳을 찾아 장소 모양으로 돌려줍니다(서버 전용).

import { supabase } from "@/lib/supabase";
import { isParkPlaceId, parkIdOf, parkToPlace } from "@/lib/parkPlace";

export async function getParkAsPlace(placeId: number | string) {
  if (!isParkPlaceId(placeId)) return null;
  const { data } = await supabase
    .from("parks")
    .select("id, name, address, lat, lng, category, area, management_agency, phone, facility_note")
    .eq("id", parkIdOf(placeId))
    .maybeSingle();
  return data ? parkToPlace(data) : null;
}
