import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";
import { normalizePlan, PLAN_NAME, RETENTION_DISCOUNT_MONTHS, RETENTION_DISCOUNT_PERCENT } from "@/lib/ownerPlans";
import { isPlacePremiumNow } from "@/lib/premium";

// 프리미엄 해지 + 해지 방어(시크릿 프라이스) — 인증된 사장님 본인만(돈이 오가는 계약이라 관리자도 대신 할 수 없음)
//   GET  → { ready, offerAvailable, discount: { percent, months } | null, cancellation: 최근 해지 기록 | null }
//   POST { step: "accept_offer" }            → 시크릿 프라이스 받기: 다음 30일 요금 30% 할인(1회 한정), 기능은 그대로
//   POST { step: "cancel", reason, offered }  → 해지: 남은 기간까지 이용 후 종료, 처리 대기 중인 연장 신청은 취소
// 표: premium_cancellations · premium_perks (scripts/sql/premium-cancel.sql, premium-perks.sql)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEED_SQL = "해지 기능을 준비하고 있어요. 잠시 후 다시 시도해 주세요.";

async function ownerOf(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return { error: "로그인이 필요해요.", status: 401 } as const;
  const { data: profile } = await db.from("users").select("owner_status, owner_place_id, owner_business_name").eq("auth_user_id", user.id).maybeSingle();
  if (profile?.owner_status !== "verified" || profile.owner_place_id == null) return { error: "해지는 인증된 사장님 본인 계정에서만 할 수 있어요.", status: 403 } as const;
  return { userId: user.id, placeId: Number(profile.owner_place_id), shopName: (profile.owner_business_name as string | null) || `업장 번호 ${profile.owner_place_id}` };
}

/** 이 업장이 시크릿 프라이스를 이미 받았거나 보고도 해지했는지(1회 한정) */
async function offerUsed(placeId: number): Promise<boolean | null> {
  const { data, error } = await db.from("premium_cancellations").select("id").eq("place_id", placeId).gt("offer_percent", 0).limit(1);
  if (error) return isMissingSchema(error) ? null : true;
  return (data ?? []).length > 0;
}

async function log(placeId: number, action: string, detail: string, by: string) {
  try { await db.from("premium_changes").insert([{ place_id: placeId, action, detail, changed_by: by }]); } catch { /* 기록 실패는 무시 */ }
}

export async function GET(req: NextRequest) {
  const owner = await ownerOf(req);
  if ("error" in owner) return fail(owner.error!, owner.status!);
  const used = await offerUsed(owner.placeId);
  if (used === null) return NextResponse.json({ ready: false, offerAvailable: false, discount: null, cancellation: null });
  const [{ data: perk }, { data: last }] = await Promise.all([
    db.from("premium_perks").select("discount_percent, discount_months").eq("place_id", owner.placeId).maybeSingle(),
    db.from("premium_cancellations").select("outcome, created_at, expires_at").eq("place_id", owner.placeId).order("created_at", { ascending: false }).limit(1),
  ]);
  const discount = perk && Number(perk.discount_percent) > 0 && Number(perk.discount_months) > 0 ? { percent: Number(perk.discount_percent), months: Number(perk.discount_months) } : null;
  return NextResponse.json({ ready: true, offerAvailable: !used, discount, cancellation: last?.[0] ?? null });
}

export async function POST(req: NextRequest) {
  const owner = await ownerOf(req);
  if ("error" in owner) return fail(owner.error!, owner.status!);
  const body = await req.json().catch(() => ({}));
  const step = body?.step;
  if (step !== "accept_offer" && step !== "cancel") return fail("요청이 올바르지 않아요.", 400);

  const { data: place } = await db.from("places").select("is_premium, premium_expires_at, premium_plan").eq("id", owner.placeId).maybeSingle();
  if (!isPlacePremiumNow(place)) return fail("지금 이용 중인 유료 요금제가 없어요.", 400);
  const plan = normalizePlan(place?.premium_plan);
  const used = await offerUsed(owner.placeId);
  if (used === null) return fail(NEED_SQL, 503);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;

  if (step === "accept_offer") {
    if (used) return fail("시크릿 프라이스는 한 번만 받을 수 있어요.", 409);
    // 다른 혜택(배너·무료 연장 기록)은 그대로 두고 할인만 적습니다.
    const { data: perk, error: perkError } = await db.from("premium_perks").select("*").eq("place_id", owner.placeId).maybeSingle();
    if (perkError) return fail(isMissingSchema(perkError) ? NEED_SQL : perkError.message, isMissingSchema(perkError) ? 503 : 500);
    const { error } = await db.from("premium_perks").upsert({
      ...(perk ?? {}), place_id: owner.placeId,
      discount_percent: RETENTION_DISCOUNT_PERCENT, discount_months: RETENTION_DISCOUNT_MONTHS,
      updated_at: new Date().toISOString(), updated_by: "해지 방어(사장님 수락)",
    }, { onConflict: "place_id" });
    if (error) return fail(error.message, 500);
    await db.from("premium_cancellations").insert([{ place_id: owner.placeId, owner_auth_user_id: owner.userId, plan, outcome: "retained", reason, offer_percent: RETENTION_DISCOUNT_PERCENT, expires_at: place?.premium_expires_at ?? null }]);
    await log(owner.placeId, "retain", `해지 방어 — 시크릿 프라이스 수락(다음 30일 ${RETENTION_DISCOUNT_PERCENT}% 할인)`, "사장님");
    await notifyAdmin({ title: "🎁 해지 방어 성공", lines: [owner.shopName, `${PLAN_NAME[plan]} 유지 · 다음 30일 ${RETENTION_DISCOUNT_PERCENT}% 할인`, reason && `해지하려던 이유: ${reason}`], path: "/admin/premium" });
    return NextResponse.json({ ok: true, outcome: "retained" });
  }

  // 해지 — 남은 기간까지 이용하고 끝납니다. 처리 대기 중인 연장 신청은 취소합니다.
  const offered = body?.offered === true && !used;
  const { error } = await db.from("premium_cancellations").insert([{ place_id: owner.placeId, owner_auth_user_id: owner.userId, plan, outcome: "cancelled", reason, offer_percent: offered ? RETENTION_DISCOUNT_PERCENT : 0, expires_at: place?.premium_expires_at ?? null }]);
  if (error) return fail(error.message, 500);
  await db.from("premium_requests").update({ status: "rejected", admin_note: "사장님 해지로 신청 취소", processed_at: new Date().toISOString(), processed_by: "사장님 해지" }).eq("place_id", owner.placeId).eq("status", "pending");
  const until = place?.premium_expires_at ? new Date(new Date(place.premium_expires_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "-";
  await log(owner.placeId, "cancel", `사장님 해지 — ${until}까지 이용 후 종료${reason ? ` (이유: ${reason})` : ""}`, "사장님");
  await notifyAdmin({ title: "📭 프리미엄 해지", lines: [owner.shopName, `${PLAN_NAME[plan]} · ${until}까지 이용 후 종료`, reason && `이유: ${reason}`, "남은 기간 환불 여부 확인 필요"], path: "/admin/premium" });
  return NextResponse.json({ ok: true, outcome: "cancelled", until });
}
