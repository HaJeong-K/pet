import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getLodging, lodgingOwnerContext, PROFILE_COLUMNS, PROFILE_EXTRA_COLUMNS, PROFILE_OTHERS_COLUMN } from "@/lib/server/lodgingStore";
import { cleanLodgingProfile } from "@/lib/lodgingRules";

// 숙소 사장님의 "숙소·객실" 화면(인증된 숙소 사장님은 본인 숙소, 관리자는 ?placeId= 로 지정한 숙소)
//   GET → 숙소 기본 정보·동반 규정 + 객실 목록(판매 중지 포함). 표가 없으면 ready: false(scripts/sql/lodging.sql 실행 전)
//   PUT → 숙소 기본 정보·동반 규정 저장 { check_in, check_out, pet_species, pet_sizes, max_pet_weight_kg, max_pets, pet_fee, ... }
// 객실 추가·수정·삭제는 /api/owner/lodging/rooms, 객실 사진은 /api/owner/lodging/image.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  try {
    return NextResponse.json(await getLodging(ctx.placeId, false));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "불러오지 못했어요.", 500);
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await lodgingOwnerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanLodgingProfile(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const save = (row: Record<string, unknown>, columns: string) => db.from("lodging_profiles")
    .upsert({ place_id: ctx.placeId, ...row, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: "place_id" })
    .select(columns).single();
  let { data, error } = await save(cleaned.profile, `${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}, ${PROFILE_OTHERS_COLUMN}`);
  // 그 외 동반 동물 칸(scripts/sql/lodging-reviews.sql) 실행 전이면 그 칸 없이 저장합니다
  if (error && isMissingSchema(error)) {
    if (cleaned.profile.pet_species.includes("other")) return fail("'그 외 동물'은 준비 중이에요. 잠시 뒤 다시 저장해 주세요.", 503);
    const { pet_others: _others, ...rest } = cleaned.profile;
    ({ data, error } = await save(rest, `${PROFILE_COLUMNS}, ${PROFILE_EXTRA_COLUMNS}`));
  }
  // 성수기·즉시 확정 칸(scripts/sql/lodging-settlement.sql) 실행 전이면 그 칸 없이 저장합니다
  if (error && isMissingSchema(error)) {
    const { peak_periods: _peak, instant_confirm: _instant, pet_others: _others, ...base } = cleaned.profile;
    ({ data, error } = await save(base, PROFILE_COLUMNS));
  }
  if (error) return fail(error.message, 500);
  return NextResponse.json({ profile: data });
}
