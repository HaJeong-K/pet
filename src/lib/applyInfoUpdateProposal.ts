// src/lib/applyInfoUpdateProposal.ts
//
// proposals.proposal_kind === "info_update" 제안(기존 장소의 빠진 정보를 채워달라는
// 제안)을 관리자가 승인했을 때 실제로 반영하는 로직입니다. approveProposal.ts(신규
// 장소 등록)와 달리, 이건 "이미 지도에 있는 장소"를 대상으로 하기 때문에 두 갈래로
// 나뉩니다.
//
//   1) places 테이블에 실제 행이 있는 장소(AWS 이관/DB 등록 장소) → 그 행을
//      UPDATE합니다. 제안에서 값이 채워진 필드만 덮어쓰고, 비어있는 필드는
//      건드리지 않습니다(기존 값을 실수로 지우지 않기 위함).
//   2) places에 실제 행이 없는 공공데이터 출처 장소(합성 id) → UPDATE할 행이
//      없으므로, 공공데이터 원본 정보 + 제안된 추가 정보를 합쳐 새 places 행을
//      "승격(graduate)"시켜 만들고, 원래 합성 id는 hidden_public_places에 올려
//      지도/검색에서 중복으로 안 뜨게 합니다(이미 있는 "장소 숨기기" 메커니즘 재사용).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";

export interface InfoUpdateProposalLike {
  id: number;
  place_id: number;
  place_name: string;
  address: string;
  category?: string | null;
  hours?: string | null;
  pet_zone?: string | null;
  large_dog?: boolean | null;
  pet_menu?: string | null;
  phone?: string | null;
  memo?: string | null;
  website?: string | null;
  closed_days?: string | null;
  parking?: string | null;
  entry_fee?: string | null;
}

export type ApplyInfoUpdateResult =
  | { ok: true; mode: "updated_existing" | "graduated_public_data" }
  | { ok: false; reason: "place_not_found" | "update_failed" | "insert_failed"; error?: unknown };

// undefined/빈 문자열은 "제안 안 함"으로 보고 건드리지 않고, 명시적으로 값이 있을
// 때만 반영 대상 필드에 넣습니다.
function pickProvided(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

export async function applyInfoUpdateProposal(
  supabase: SupabaseClient,
  proposal: InfoUpdateProposalLike
): Promise<ApplyInfoUpdateResult> {
  const provided = pickProvided({
    category: proposal.category,
    hours: proposal.hours,
    pet_zone: proposal.pet_zone,
    large_dog: proposal.large_dog,
    pet_menu: proposal.pet_menu,
    phone: proposal.phone,
    memo: proposal.memo,
    website: proposal.website,
    closed_days: proposal.closed_days,
    parking: proposal.parking,
    entry_fee: proposal.entry_fee,
  });

  // 1) 실제 DB 행인지 먼저 확인
  const { data: existing } = await supabase
    .from("places")
    .select("id")
    .eq("id", proposal.place_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("places").update(provided).eq("id", proposal.place_id);
    if (error) {
      console.error("[applyInfoUpdateProposal] 기존 장소 업데이트 실패:", error.message);
      return { ok: false, reason: "update_failed", error };
    }
    return { ok: true, mode: "updated_existing" };
  }

  // 2) 실제 행이 없는 공공데이터 출처 장소 — 원본 정보를 찾아 제안 내용과 합쳐
  //    새 행으로 승격시킵니다.
  const publicDataPlaces = await fetchPublicDataPlaces();
  const original = publicDataPlaces.find((p) => String(p.id) === String(proposal.place_id));
  if (!original) {
    return { ok: false, reason: "place_not_found" };
  }

  const merged = {
    name: original.name,
    address: original.address,
    lat: original.lat,
    lng: original.lng,
    pet_zone: provided.pet_zone ?? original.pet_zone,
    category: provided.category ?? original.category,
    hours: provided.hours ?? original.hours,
    large_dog: provided.large_dog ?? original.large_dog,
    pet_menu: provided.pet_menu ?? original.pet_menu,
    phone: provided.phone ?? original.phone,
    memo: provided.memo ?? original.memo,
    website: provided.website ?? original.website,
    closed_days: provided.closed_days ?? original.closed_days,
    parking: provided.parking ?? original.parking,
    entry_fee: provided.entry_fee ?? original.entry_fee,
    image_url: original.image_url || null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("places")
    .insert([merged])
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[applyInfoUpdateProposal] 공공데이터 장소 승격 실패:", insertError?.message);
    return { ok: false, reason: "insert_failed", error: insertError };
  }

  // 원래 합성 id는 숨겨서 새로 승격된 실제 행과 중복으로 뜨지 않게 합니다
  // (관리자 "장소 숨기기"와 동일한 hidden_public_places 메커니즘).
  await supabase.from("hidden_public_places").upsert(
    [{ place_id: proposal.place_id, reason: "정보 추가 제안 승인으로 실제 행으로 승격됨", hidden_by: "system(info_update_proposal)" }],
    { onConflict: "place_id" }
  );

  return { ok: true, mode: "graduated_public_data" };
}
