import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { isMissingSchema } from "@/lib/server/ownerStore";
import { bannerRegionOf, bannerSource, type BannerPerk } from "@/lib/localAds";
import { normalizePlan, PLAN_NAME, type PaidPlanId } from "@/lib/ownerPlans";
import { adjustExpiry, PREMIUM_ADJUST_DAYS_MAX } from "@/lib/premiumPeriod";

// 관리자 전용: 프리미엄을 이용 중인(또는 이용했던) 가게 관리
//   GET  → 프리미엄 가게 목록 + 사장님 정보 + 요금제 단계 + 배너 노출 여부 + 가게별 추가 혜택 + 최근 변경 기록
//          + 시·군·구별 배너 가게 현황(bannerRegions)
//   POST { placeId, action }
//        "adjustDays" { days }   : 이용 기간을 며칠 늘리거나(+) 줄입니다(−). 줄여서 오늘 이전이 되면 바로 종료됩니다.
//        "extend"     { months } : 개월 단위 무료 연장(남은 기간에 이어서). 무료 연장 누적 개월에 더함
//        "setPlan"    { plan }   : 요금제 단계 바꾸기(프리미엄 / 프리미엄 스토어 / 동네 대표)
//        "setPerks"   { bannerAd, bannerUntil, discountPercent, discountMonths, memo } : 추가 혜택 저장
//        "end"                   : 프리미엄 종료(지금 바로 내림)
// 모든 변경은 premium_changes에 "누가·언제·무엇을" 남깁니다(표가 없으면 기록만 건너뜀 — scripts/sql/owner-store.sql).

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const perksMissing = (message: string) => /premium_perks/.test(message);
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const fmtDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/** 변경 기록 남기기 — 실패해도(표가 없어도) 본 작업을 막지 않습니다 */
async function log(placeId: number, action: string, detail: string, by: string) {
  try { await supabaseAdmin.from("premium_changes").insert([{ place_id: placeId, action, detail, changed_by: by }]); } catch { /* 기록 실패는 무시 */ }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);

  const columns = "id, name, address, category, phone, is_premium, premium_expires_at";
  let planReady = true;
  let { data: places, error } = await supabaseAdmin.from("places").select(`${columns}, premium_plan`)
    .or("is_premium.eq.true,premium_expires_at.not.is.null").order("premium_expires_at", { ascending: false });
  if (error && isMissingSchema(error)) {
    planReady = false;
    ({ data: places, error } = await supabaseAdmin.from("places").select(columns)
      .or("is_premium.eq.true,premium_expires_at.not.is.null").order("premium_expires_at", { ascending: false }) as never);
  }
  if (error) return fail(error.message, 500);
  const rows = (places ?? []) as { id: number; name: string; address: string | null; category: string | null; phone: string | null; is_premium: boolean; premium_expires_at: string | null; premium_plan?: string | null }[];
  const ids = rows.map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ perksReady: true, planReady, historyReady: true, bannerRegions: [], places: [] });

  const [owners, requests, perks, changes] = await Promise.all([
    supabaseAdmin.from("users").select("auth_user_id, email, nickname, owner_business_name, owner_phone, owner_place_id, owner_status").in("owner_place_id", ids),
    supabaseAdmin.from("premium_requests").select("place_id, months, status, requested_at, processed_at").in("place_id", ids).order("requested_at", { ascending: false }),
    supabaseAdmin.from("premium_perks").select("*").in("place_id", ids),
    supabaseAdmin.from("premium_changes").select("place_id, action, detail, changed_by, created_at").in("place_id", ids).order("created_at", { ascending: false }).limit(500),
  ]);
  const now = Date.now();
  const perkOf = (id: number) => (perks.data ?? []).find((k) => Number(k.place_id) === Number(id)) ?? null;

  const list = rows.map((p) => {
    const owner = (owners.data ?? []).find((o) => Number(o.owner_place_id) === Number(p.id) && o.owner_status === "verified") ?? null;
    const history = (requests.data ?? []).filter((r) => Number(r.place_id) === Number(p.id));
    const approved = history.filter((r) => r.status === "approved");
    const expiresAt = p.premium_expires_at ? new Date(p.premium_expires_at).getTime() : 0;
    const perk = perkOf(p.id);
    return {
      id: p.id, name: p.name, address: p.address, category: p.category, phone: p.phone,
      active: !!p.is_premium && expiresAt > now,
      expiresAt: p.premium_expires_at,
      daysLeft: expiresAt > now ? Math.ceil((expiresAt - now) / DAY_MS) : 0,
      plan: normalizePlan(p.premium_plan),
      banner: bannerSource(p, perk as BannerPerk, now),
      bannerRegion: bannerRegionOf(p.address),
      owner: owner ? { email: owner.email, nickname: owner.nickname, businessName: owner.owner_business_name, phone: owner.owner_phone } : null,
      paidMonths: approved.reduce((sum, r) => sum + (r.months ?? 0), 0),
      firstApprovedAt: approved.length ? approved[approved.length - 1].processed_at ?? approved[approved.length - 1].requested_at : null,
      pendingRequests: history.filter((r) => r.status === "pending").length,
      perks: perk,
      changes: (changes.data ?? []).filter((c) => Number(c.place_id) === Number(p.id)).slice(0, 6),
    };
  });

  // 시·군·구별 배너 자리 현황
  const regionMap = new Map<string, string[]>();
  for (const p of list) if (p.banner) regionMap.set(p.bannerRegion, [...(regionMap.get(p.bannerRegion) ?? []), p.name]);
  const bannerRegions = [...regionMap].map(([region, names]) => ({ region, names })).sort((a, b) => b.names.length - a.names.length || a.region.localeCompare(b.region, "ko"));

  return NextResponse.json({ perksReady: !perks.error, planReady, historyReady: !changes.error, bannerRegions, places: list });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => ({}))) as {
    placeId?: number | string; action?: string; months?: number; days?: number; plan?: string;
    bannerAd?: boolean; bannerUntil?: string | null; discountPercent?: number; discountMonths?: number; memo?: string | null;
  };
  const placeId = Number(body.placeId);
  if (!Number.isFinite(placeId) || placeId <= 0) return fail("placeId required", 400);
  const by = adminUser.email || adminUser.id;

  let planColumn = true;
  const found = await supabaseAdmin.from("places").select("id, name, address, is_premium, premium_expires_at, premium_plan").eq("id", placeId).maybeSingle();
  let place = found.data;
  if (found.error && isMissingSchema(found.error)) {
    planColumn = false;
    ({ data: place } = await supabaseAdmin.from("places").select("id, name, address, is_premium, premium_expires_at").eq("id", placeId).maybeSingle() as never);
  }
  if (!place) return fail("가게를 찾을 수 없어요.", 404);
  const currentPlan = normalizePlan((place as { premium_plan?: string | null }).premium_plan);
  const { data: perkRow } = await supabaseAdmin.from("premium_perks").select("banner_ad, banner_until, free_months_granted").eq("place_id", placeId).maybeSingle();

  if (body.action === "adjustDays") {
    const result = adjustExpiry(place.premium_expires_at, Number(body.days));
    if ("error" in result) return fail(result.error, 400);
    const { error } = await supabaseAdmin.from("places").update({ is_premium: !result.ended, premium_expires_at: result.expiresAt }).eq("id", placeId);
    if (error) return fail(error.message, 500);
    const days = Math.round(Number(body.days));
    await log(placeId, result.ended ? "end" : days > 0 ? "extend" : "shorten",
      result.ended ? `${Math.abs(days)}일 줄여 바로 종료` : `${days > 0 ? "+" : "−"}${Math.abs(days)}일 → 만료 ${fmtDay(result.expiresAt)}`, by);
    return NextResponse.json({ ok: true, expiresAt: result.expiresAt, ended: result.ended });
  }

  if (body.action === "extend") {
    const months = Math.round(Number(body.months));
    if (!(months >= 1 && months <= 24)) return fail("연장 개월 수는 1~24 사이여야 해요.", 400);
    // 아직 남은 기간이 있으면 거기에 이어 붙입니다(남은 기간을 날리지 않게).
    const current = place.premium_expires_at ? new Date(place.premium_expires_at).getTime() : 0;
    const expiresAt = new Date(Math.max(current, Date.now()) + months * MONTH_MS).toISOString();
    const { error } = await supabaseAdmin.from("places").update({ is_premium: true, premium_expires_at: expiresAt }).eq("id", placeId);
    if (error) return fail(error.message, 500);
    // 무료 연장 누적(표가 없으면 기록만 건너뜁니다)
    await supabaseAdmin.from("premium_perks").upsert(
      [{ place_id: placeId, free_months_granted: (perkRow?.free_months_granted ?? 0) + months, updated_at: new Date().toISOString(), updated_by: by }],
      { onConflict: "place_id" }
    );
    await log(placeId, "extend", `+${months}개월 무료 연장 → 만료 ${fmtDay(expiresAt)}`, by);
    return NextResponse.json({ ok: true, expiresAt });
  }

  if (body.action === "setPlan") {
    if (body.plan !== "premium" && body.plan !== "store" && body.plan !== "local") return fail("요금제를 골라 주세요.", 400);
    const plan = body.plan as PaidPlanId;
    if (!planColumn) return fail("요금제 단계를 저장할 칸이 아직 없어요. Supabase SQL 편집기에서 scripts/sql/owner-store.sql을 실행해 주세요.", 503);
    if (plan === currentPlan) return NextResponse.json({ ok: true });
    const { error } = await supabaseAdmin.from("places").update({ premium_plan: plan }).eq("id", placeId);
    if (error) return fail(error.message, 500);
    await log(placeId, "plan", `${PLAN_NAME[currentPlan]} → ${PLAN_NAME[plan]}`, by);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "end") {
    const { error } = await supabaseAdmin.from("places").update({ is_premium: false, premium_expires_at: new Date().toISOString() }).eq("id", placeId);
    if (error) return fail(error.message, 500);
    await log(placeId, "end", "프리미엄 종료", by);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "setPerks") {
    const discountPercent = Math.round(Number(body.discountPercent ?? 0));
    const discountMonths = Math.round(Number(body.discountMonths ?? 0));
    if (!(discountPercent >= 0 && discountPercent <= 100) || !(discountMonths >= 0 && discountMonths <= 36)) {
      return fail("할인율은 0~100, 할인 개월 수는 0~36 사이여야 해요.", 400);
    }
    const bannerUntil = body.bannerUntil ? new Date(body.bannerUntil) : null;
    if (bannerUntil && Number.isNaN(bannerUntil.getTime())) return fail("배너 기한 날짜가 올바르지 않아요.", 400);
    const { error } = await supabaseAdmin.from("premium_perks").upsert(
      [{
        place_id: placeId,
        banner_ad: !!body.bannerAd,
        banner_until: body.bannerAd && bannerUntil ? bannerUntil.toISOString() : null,
        discount_percent: discountPercent,
        discount_months: discountPercent > 0 ? discountMonths : 0,
        memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim().slice(0, 500) : null,
        updated_at: new Date().toISOString(),
        updated_by: by,
      }],
      { onConflict: "place_id" }
    );
    if (error) {
      return fail(perksMissing(error.message) ? "혜택을 저장할 표가 아직 없어요. Supabase SQL 편집기에서 scripts/sql/premium-perks.sql을 실행해 주세요." : error.message, perksMissing(error.message) ? 503 : 500);
    }
    await log(placeId, "perks", [
      body.bannerAd ? `배너 제공${bannerUntil ? `(~${fmtDay(bannerUntil.toISOString())})` : ""}` : "배너 없음",
      discountPercent > 0 ? `${discountPercent}% 할인 ${discountMonths}개월` : "할인 없음",
    ].join(" · "), by);
    return NextResponse.json({ ok: true });
  }

  return fail(`action required (기간은 한 번에 ${PREMIUM_ADJUST_DAYS_MAX}일까지)`, 400);
}
