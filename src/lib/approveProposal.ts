// src/lib/approveProposal.ts
//
// 제보(proposals) 한 건을 실제 places 테이블에 등록하는 로직 — 원래 admin/tips
// 페이지의 handleApprove 안에만 있었는데, 이제 두 곳에서 똑같이 써야 합니다.
//   1) 관리자가 "승인" 버튼을 눌렀을 때 (수동)
//   2) 제보 사진이 AI 비전 검증을 통과했을 때 (자동, jebo 제출 흐름)
// 두 경로가 서로 다른 코드로 places에 INSERT하면 필드 누락 등으로 결과가
// 미묘하게 달라질 위험이 있어서, 하나의 함수로 합쳤습니다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/geocodeAddress";

export interface ProposalLike {
  id: number;
  place_name: string;
  address: string;
  lat?: string | number | null;
  lng?: string | number | null;
  pet_zone?: string | null;
  category?: string | null;
  hours?: string | null;
  large_dog?: boolean | null;
  phone?: string | null;
  memo?: string | null;
  image_urls?: string[] | null;
  specialty_department?: string | null;
  treatable_animals?: string | null;
}

export type ApproveResult =
  | { ok: true; placeId: number | null; lat: string; lng: string }
  | { ok: false; reason: "no_coords" | "insert_failed"; error?: unknown };

/** proposal 하나를 places(+place_images)에 등록하고 proposals 상태를 approved로 갱신합니다. */
export async function approveProposal(
  supabase: SupabaseClient,
  proposal: ProposalLike,
  extra?: { autoApprovedByAi?: boolean }
): Promise<ApproveResult> {
  let lat = proposal.lat as string | null | undefined;
  let lng = proposal.lng as string | null | undefined;

  if (!lat || !lng) {
    const coords = await geocodeAddress(proposal.address);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  if (!lat || !lng) {
    return { ok: false, reason: "no_coords" };
  }

  const { error: insertError } = await supabase.from("places").insert([
    {
      name: proposal.place_name,
      address: proposal.address,
      lat,
      lng,
      pet_zone: proposal.pet_zone,
      category: proposal.category,
      hours: proposal.hours,
      large_dog: proposal.large_dog,
      phone: proposal.phone,
      memo: proposal.memo,
      image_url: proposal.image_urls?.[0] || null,
      specialty_department: proposal.specialty_department || null,
      treatable_animals: proposal.treatable_animals || null,
    },
  ]);

  if (insertError) {
    console.error("장소 등록 실패:", JSON.stringify(insertError, null, 2));
    return { ok: false, reason: "insert_failed", error: insertError };
  }

  const { data: insertedPlace } = await supabase
    .from("places")
    .select("id")
    .eq("name", proposal.place_name)
    .eq("address", proposal.address)
    .single();

  if (insertedPlace && proposal.image_urls && proposal.image_urls.length > 1) {
    const extraImages = proposal.image_urls.slice(1).map((url: string) => ({
      place_id: insertedPlace.id,
      image_url: url,
    }));
    await supabase.from("place_images").insert(extraImages);
  }

  await supabase
    .from("proposals")
    .update({
      status: "approved",
      is_resolved: true,
      lat,
      lng,
      ...(extra?.autoApprovedByAi ? { ai_verified: true } : {}),
    })
    .eq("id", proposal.id);

  return { ok: true, placeId: insertedPlace?.id ?? null, lat, lng };
}
