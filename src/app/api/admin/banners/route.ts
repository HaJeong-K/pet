import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { loadBannerCandidates } from "@/lib/server/bannerAds";
import { bannerRegionOf, bannerSource } from "@/lib/localAds";
import { changeAllowance } from "@/lib/bannerCreative";

// 관리자 전용: 배너 광고 관리
//   GET  → ① 사장님이 보낸 "2주 한도 변경 요청" ② 가게별 배너 내용(문구·사진·글꼴)과 노출 여부·노출 횟수
//   POST { action }
//        "approve" { requestId, adminNote } : 요청 승인 → 그 가게가 한 번 더 바꿀 수 있게 엽니다
//        "reject"  { requestId, adminNote } : 요청 거절
//        "grant"   { placeId }              : 요청 없이도 한 번 더 바꿀 수 있게 엽니다(전화로 부탁받았을 때 등)
//        "hide"    { placeId, reason }      : 배너 내리기(부적절한 내용) — 가게는 기본 모양으로 나갑니다
//        "show"    { placeId }              : 내린 배너 다시 올리기

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NOT_READY = "배너 표가 아직 없어요. Supabase SQL 편집기에서 scripts/sql/banner-ads.sql을 실행해 주세요.";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const [requests, banners, serves] = await Promise.all([
    db.from("banner_change_requests").select("id, place_id, reason, status, admin_note, created_at, processed_at, processed_by").order("created_at", { ascending: false }).limit(200),
    db.from("owner_banners").select("place_id, headline, body, image_url, font, changed_at, extra_changes, hidden, hidden_reason"),
    db.from("banner_serves").select("place_id, serve_count"),
  ]);
  if (banners.error && isMissingSchema(banners.error)) return NextResponse.json({ ready: false, requests: [], banners: [] });
  if (banners.error) return fail(banners.error.message, 500);

  const { places, perks } = await loadBannerCandidates().catch(() => ({ places: [], perks: new Map() }));
  const ids = [...new Set([...(requests.data ?? []).map((r) => Number(r.place_id)), ...(banners.data ?? []).map((b) => Number(b.place_id))])];
  const { data: named } = ids.length ? await db.from("places").select("id, name, address, image_url").in("id", ids) : { data: [] };
  const placeOf = new Map((named ?? []).map((p) => [Number(p.id), p]));
  const serveOf = new Map((serves.data ?? []).map((s) => [Number(s.place_id), Number(s.serve_count)]));

  return NextResponse.json({
    ready: true,
    requests: (requests.data ?? []).map((r) => ({ ...r, placeName: placeOf.get(Number(r.place_id))?.name ?? `장소 #${r.place_id}` })),
    banners: (banners.data ?? []).map((b) => {
      const place = placeOf.get(Number(b.place_id));
      const active = places.find((p) => Number(p.id) === Number(b.place_id));
      return {
        placeId: Number(b.place_id), placeName: place?.name ?? `장소 #${b.place_id}`, region: bannerRegionOf(place?.address), placeImage: place?.image_url ?? null,
        headline: b.headline, body: b.body, imageUrl: b.image_url, font: b.font, changedAt: b.changed_at,
        extraChanges: b.extra_changes, hidden: b.hidden, hiddenReason: b.hidden_reason,
        live: !!active && bannerSource(active, perks.get(Number(b.place_id))) !== null,
        allowance: changeAllowance(b.changed_at, b.extra_changes),
        serves: serveOf.get(Number(b.place_id)) ?? 0,
      };
    }).sort((a, b) => Number(b.live) - Number(a.live) || a.region.localeCompare(b.region, "ko")),
  });
}

/** 그 가게가 한 번 더 바꿀 수 있게 엽니다(배너를 아직 안 만든 가게는 한도가 없으니 그대로 둡니다) */
async function grantExtra(placeId: number): Promise<string | null> {
  const { data, error } = await db.from("owner_banners").select("extra_changes").eq("place_id", placeId).maybeSingle();
  if (error) return isMissingSchema(error) ? NOT_READY : error.message;
  if (!data) return null;
  const { error: updateError } = await db.from("owner_banners").update({ extra_changes: (data.extra_changes ?? 0) + 1 }).eq("place_id", placeId);
  return updateError ? updateError.message : null;
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => ({}))) as { action?: string; requestId?: number; placeId?: number; adminNote?: string; reason?: string };
  const by = adminUser.email || adminUser.id;
  const note = typeof body.adminNote === "string" && body.adminNote.trim() ? body.adminNote.trim().slice(0, 300) : null;

  if (body.action === "approve" || body.action === "reject") {
    const requestId = Number(body.requestId);
    const { data: request, error } = await db.from("banner_change_requests").select("id, place_id, status").eq("id", requestId).maybeSingle();
    if (error) return fail(isMissingSchema(error) ? NOT_READY : error.message, 500);
    if (!request) return fail("요청을 찾을 수 없어요.", 404);
    if (request.status !== "pending") return fail("이미 처리한 요청이에요.", 409);
    if (body.action === "approve") {
      const problem = await grantExtra(Number(request.place_id));
      if (problem) return fail(problem, 500);
    }
    const { error: updateError } = await db.from("banner_change_requests")
      .update({ status: body.action === "approve" ? "approved" : "rejected", admin_note: note, processed_at: new Date().toISOString(), processed_by: by })
      .eq("id", requestId).eq("status", "pending");
    if (updateError) return fail(updateError.message, 500);
    return NextResponse.json({ ok: true });
  }

  const placeId = Number(body.placeId);
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("placeId required", 400);
  if (body.action === "grant") {
    const problem = await grantExtra(placeId);
    return problem ? fail(problem, 500) : NextResponse.json({ ok: true });
  }
  if (body.action === "hide" || body.action === "show") {
    const hide = body.action === "hide";
    const reason = hide && typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : null;
    const { error } = await db.from("owner_banners").update({ hidden: hide, hidden_reason: reason }).eq("place_id", placeId);
    if (error) return fail(isMissingSchema(error) ? NOT_READY : error.message, 500);
    return NextResponse.json({ ok: true });
  }
  return fail("action required", 400);
}
