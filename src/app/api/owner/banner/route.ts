import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, ownerContext } from "@/lib/server/ownerStore";
import { bannerSource, bannerRegionOf, type BannerPerk } from "@/lib/localAds";
import { changeAllowance, cleanBannerCreative } from "@/lib/bannerCreative";
import { notifyAdmin } from "@/lib/server/notify";
import { createRateLimiter } from "@/lib/server/rateLimit";

// 사장님의 배너 광고 만들기(인증된 사장님은 본인 가게, 관리자는 ?placeId= 로 지정한 가게)
//   GET   → 지금 배너 내용, 배너가 나갈 수 있는 상태인지, 지금 바꿀 수 있는지(2주에 한 번), 한도 변경 요청 내역
//   POST  → 배너 저장 { headline, body, imageUrl, font }  — 2주 한도 안에서는 관리자가 풀어 준 횟수가 있을 때만
//   PUT   → 한도 변경 요청 { reason }  — 관리자가 승인하면 한 번 더 바꿀 수 있습니다
// 사진은 /api/owner/banner/image로 먼저 올리고, 받은 주소를 여기로 보냅니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NOT_READY = "배너 만들기를 준비하고 있어요(scripts/sql/banner-ads.sql 실행 전).";
const allowRequest = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

async function placeAndPerk(placeId: number) {
  let { data, error } = await db.from("places").select("id, name, address, image_url, is_premium, premium_expires_at, premium_plan").eq("id", placeId).maybeSingle();
  if (error && isMissingSchema(error)) {
    ({ data, error } = await db.from("places").select("id, name, address, image_url, is_premium, premium_expires_at").eq("id", placeId).maybeSingle() as never);
  }
  const { data: perk } = await db.from("premium_perks").select("banner_ad, banner_until").eq("place_id", placeId).maybeSingle();
  return { place: data as { id: number; name: string; address: string | null; image_url: string | null; is_premium: boolean; premium_expires_at: string | null; premium_plan?: string | null } | null, perk: perk as BannerPerk };
}

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const { place, perk } = await placeAndPerk(ctx.placeId);
  if (!place) return fail("가게를 찾을 수 없어요.", 404);

  const { data: banner, error } = await db.from("owner_banners").select("headline, body, image_url, font, changed_at, extra_changes, hidden, hidden_reason").eq("place_id", ctx.placeId).maybeSingle();
  if (error && isMissingSchema(error)) return NextResponse.json({ ready: false });
  if (error) return fail(error.message, 500);
  const { data: requests } = await db.from("banner_change_requests").select("id, reason, status, admin_note, created_at, processed_at").eq("place_id", ctx.placeId).order("created_at", { ascending: false }).limit(5);

  return NextResponse.json({
    ready: true,
    place: { name: place.name, image: place.image_url, region: bannerRegionOf(place.address) },
    /** 지금 배너가 실제로 나가는 상태인지('동네 대표' 요금제이거나 관리자 혜택) — 아니어도 미리 만들어 둘 수 있습니다 */
    live: bannerSource(place, perk) !== null,
    banner: banner ? { headline: banner.headline, body: banner.body, imageUrl: banner.image_url, font: banner.font, changedAt: banner.changed_at, hidden: banner.hidden, hiddenReason: banner.hidden_reason } : null,
    allowance: changeAllowance(banner?.changed_at ?? null, banner?.extra_changes ?? 0),
    extraChanges: banner?.extra_changes ?? 0,
    requests: requests ?? [],
  });
}

export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const cleaned = cleanBannerCreative(await req.json().catch(() => null));
  if ("error" in cleaned) return fail(cleaned.error, 400);
  const { creative } = cleaned;
  // 사진은 우리 저장소(배너 사진 보관함)에 올린 것만 받습니다 — 바깥 주소를 그대로 광고에 싣지 않습니다.
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/banner-images/${ctx.placeId}/`;
  if (creative.imageUrl && !creative.imageUrl.startsWith(storageBase)) return fail("사진을 다시 올려 주세요.", 400);

  const { data: current, error: readError } = await db.from("owner_banners").select("changed_at, extra_changes").eq("place_id", ctx.placeId).maybeSingle();
  if (readError) return fail(isMissingSchema(readError) ? NOT_READY : readError.message, isMissingSchema(readError) ? 503 : 500);
  const allowance = changeAllowance(current?.changed_at ?? null, current?.extra_changes ?? 0);
  // 관리자가 대신 고치는 경우(사장님 요청)에는 한도를 따지지 않고, 사장님의 다음 변경 가능일도 건드리지 않습니다.
  if (!ctx.isAdmin && !allowance.allowed) {
    return fail(`배너는 2주에 한 번 바꿀 수 있어요. ${allowance.daysLeft}일 뒤에 다시 바꿀 수 있어요. 급하면 아래에서 한도 변경을 요청해 주세요.`, 409);
  }

  const row = {
    place_id: ctx.placeId, headline: creative.headline, body: creative.body, image_url: creative.imageUrl, font: creative.font, updated_by: ctx.userId,
    ...(ctx.isAdmin && current ? {} : { changed_at: new Date().toISOString() }),
    ...(!ctx.isAdmin && allowance.usesExtra ? { extra_changes: Math.max(0, (current?.extra_changes ?? 0) - 1) } : {}),
    // 내용을 새로 올리면 숨김은 풀립니다(관리자가 내린 배너를 고쳐 다시 올리는 흐름)
    hidden: false, hidden_reason: null,
  };
  const { error } = await db.from("owner_banners").upsert([row], { onConflict: "place_id" });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (!allowRequest(ctx.userId)) return fail("요청을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.", 429);
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 5) return fail("바꿔야 하는 이유를 조금 더 적어 주세요.", 400);

  const { data: pending, error: readError } = await db.from("banner_change_requests").select("id").eq("place_id", ctx.placeId).eq("status", "pending").limit(1);
  if (readError) return fail(isMissingSchema(readError) ? NOT_READY : readError.message, isMissingSchema(readError) ? 503 : 500);
  if (pending && pending.length > 0) return fail("이미 보낸 요청을 확인하고 있어요. 조금만 기다려 주세요.", 409);

  const { error } = await db.from("banner_change_requests").insert([{ place_id: ctx.placeId, auth_user_id: ctx.userId, reason }]);
  if (error) return fail(error.message, 500);
  const { place } = await placeAndPerk(ctx.placeId);
  await notifyAdmin({ title: "📝 배너 변경 한도 요청", lines: [place?.name ?? `장소 #${ctx.placeId}`, reason.slice(0, 80)], path: "/admin/premium?tab=banners" });
  return NextResponse.json({ ok: true });
}
