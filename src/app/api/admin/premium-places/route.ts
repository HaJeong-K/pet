import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";

// 관리자 전용: 프리미엄을 이용 중인(또는 이용했던) 가게 관리
//   GET  → 프리미엄 가게 목록 + 사장님 정보 + 가게별 추가 혜택(premium_perks)
//   POST { placeId, action }
//        action "extend"   { months }  : 프리미엄 기간을 그만큼 늘림(남은 기간에 이어서). 무료 연장 누적 개월에 더함
//        action "setPerks" { bannerAd, bannerUntil, discountPercent, discountMonths, memo } : 추가 혜택 저장
//        action "end"                  : 프리미엄 종료(지금 바로 내림)
// 혜택 표(premium_perks)가 아직 없으면(scripts/sql/premium-perks.sql 실행 전) 목록·연장·종료는 되고 혜택 저장만 안내합니다.

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const perksMissing = (message: string) => /premium_perks/.test(message);

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });

  const { data: places, error } = await supabaseAdmin
    .from("places")
    .select("id, name, address, category, phone, is_premium, premium_expires_at")
    .or("is_premium.eq.true,premium_expires_at.not.is.null")
    .order("premium_expires_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (places ?? []).map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ perksReady: true, places: [] });

  const [owners, requests, perks] = await Promise.all([
    supabaseAdmin.from("users").select("auth_user_id, email, nickname, owner_business_name, owner_phone, owner_place_id, owner_status").in("owner_place_id", ids),
    supabaseAdmin.from("premium_requests").select("place_id, months, status, requested_at, processed_at").in("place_id", ids).order("requested_at", { ascending: false }),
    supabaseAdmin.from("premium_perks").select("*").in("place_id", ids),
  ]);
  const perksReady = !perks.error;
  const now = Date.now();

  return NextResponse.json({
    perksReady,
    places: (places ?? []).map((p) => {
      const owner = (owners.data ?? []).find((o) => Number(o.owner_place_id) === Number(p.id) && o.owner_status === "verified") ?? null;
      const history = (requests.data ?? []).filter((r) => Number(r.place_id) === Number(p.id));
      const approved = history.filter((r) => r.status === "approved");
      const expiresAt = p.premium_expires_at ? new Date(p.premium_expires_at).getTime() : 0;
      return {
        id: p.id, name: p.name, address: p.address, category: p.category, phone: p.phone,
        active: !!p.is_premium && expiresAt > now,
        expiresAt: p.premium_expires_at,
        daysLeft: expiresAt > now ? Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)) : 0,
        owner: owner ? { email: owner.email, nickname: owner.nickname, businessName: owner.owner_business_name, phone: owner.owner_phone } : null,
        paidMonths: approved.reduce((sum, r) => sum + (r.months ?? 0), 0),
        firstApprovedAt: approved.length ? approved[approved.length - 1].processed_at ?? approved[approved.length - 1].requested_at : null,
        pendingRequests: history.filter((r) => r.status === "pending").length,
        perks: (perks.data ?? []).find((k) => Number(k.place_id) === Number(p.id)) ?? null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    placeId?: number | string; action?: string; months?: number;
    bannerAd?: boolean; bannerUntil?: string | null; discountPercent?: number; discountMonths?: number; memo?: string | null;
  };
  const placeId = Number(body.placeId);
  if (!Number.isFinite(placeId) || placeId <= 0) return NextResponse.json({ error: "placeId required" }, { status: 400 });
  const by = adminUser.email || adminUser.id;

  const { data: place } = await supabaseAdmin.from("places").select("id, is_premium, premium_expires_at").eq("id", placeId).maybeSingle();
  if (!place) return NextResponse.json({ error: "가게를 찾을 수 없어요." }, { status: 404 });

  if (body.action === "extend") {
    const months = Math.round(Number(body.months));
    if (!(months >= 1 && months <= 24)) return NextResponse.json({ error: "연장 개월 수는 1~24 사이여야 해요." }, { status: 400 });
    // 아직 남은 기간이 있으면 거기에 이어 붙입니다(남은 기간을 날리지 않게).
    const current = place.premium_expires_at ? new Date(place.premium_expires_at).getTime() : 0;
    const expiresAt = new Date(Math.max(current, Date.now()) + months * MONTH_MS).toISOString();
    const { error } = await supabaseAdmin.from("places").update({ is_premium: true, premium_expires_at: expiresAt }).eq("id", placeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // 무료 연장 누적(표가 없으면 기록만 건너뜁니다)
    const { data: perk } = await supabaseAdmin.from("premium_perks").select("free_months_granted").eq("place_id", placeId).maybeSingle();
    await supabaseAdmin.from("premium_perks").upsert(
      [{ place_id: placeId, free_months_granted: (perk?.free_months_granted ?? 0) + months, updated_at: new Date().toISOString(), updated_by: by }],
      { onConflict: "place_id" }
    );
    return NextResponse.json({ ok: true, expiresAt });
  }

  if (body.action === "end") {
    const { error } = await supabaseAdmin.from("places").update({ is_premium: false, premium_expires_at: new Date().toISOString() }).eq("id", placeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "setPerks") {
    const discountPercent = Math.round(Number(body.discountPercent ?? 0));
    const discountMonths = Math.round(Number(body.discountMonths ?? 0));
    if (!(discountPercent >= 0 && discountPercent <= 100) || !(discountMonths >= 0 && discountMonths <= 36)) {
      return NextResponse.json({ error: "할인율은 0~100, 할인 개월 수는 0~36 사이여야 해요." }, { status: 400 });
    }
    const bannerUntil = body.bannerUntil ? new Date(body.bannerUntil) : null;
    if (bannerUntil && Number.isNaN(bannerUntil.getTime())) return NextResponse.json({ error: "배너 기한 날짜가 올바르지 않아요." }, { status: 400 });
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
      return NextResponse.json(
        { error: perksMissing(error.message) ? "혜택을 저장할 표가 아직 없어요. Supabase SQL 편집기에서 scripts/sql/premium-perks.sql을 실행해 주세요." : error.message },
        { status: perksMissing(error.message) ? 503 : 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action required" }, { status: 400 });
}
