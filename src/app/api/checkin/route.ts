import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { getPlaceCoords } from "@/lib/server/placeMeta";
import { CHECKIN_RADIUS_M, MAX_USABLE_ACCURACY_M, distanceM } from "@/lib/walkMode";

// 방문 체크인(방문 인증)
//   POST { placeId, lat, lng, accuracy, userKey?, source? }  → 장소 근처에 있을 때만 기록
//   GET  ?placeId=123                                        → 방문 인증 수 + 방문 인증된 후기 번호 목록
//
// 거리는 서버가 장소 좌표로 직접 계산합니다(브라우저가 "인증됐다"고 보내는 값은 믿지 않음).
// 위치 좌표는 거리 확인에만 쓰고 저장하지 않습니다. 한 사람이 같은 장소를 하루에 한 번만 인증할 수 있습니다.
// ※ 브라우저가 보내는 위치 자체를 꾸며낼 수는 있어서 완벽한 증명은 아닙니다 — 후기 신뢰도를 높이는 표시 용도입니다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const allowPost = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });
const allowGet = createRateLimiter({ windowMs: 60_000, max: 120 });

const tableMissing = (message: string) => /place_checkins/.test(message) && /find|exist|schema cache/i.test(message);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 한국 시간 오늘 0시(UTC ISO) */
function kstTodayStartIso(): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST_OFFSET_MS).toISOString();
}

export async function POST(req: NextRequest) {
  if (!allowPost(clientIp(req))) return NextResponse.json({ error: "요청이 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as {
    placeId?: number | string; lat?: number; lng?: number; accuracy?: number; userKey?: string; source?: string;
  };
  const lat = Number(body.lat), lng = Number(body.lng), accuracy = Number(body.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "현재 위치를 확인할 수 없어요." }, { status: 400 });
  if (!Number.isFinite(accuracy) || accuracy > MAX_USABLE_ACCURACY_M) {
    return NextResponse.json({ error: "현재 위치가 정확하지 않아 방문 인증을 할 수 없어요. 휴대폰 GPS를 켜고 다시 시도해 주세요." }, { status: 422 });
  }

  const place = await getPlaceCoords(body.placeId ?? "");
  if (!place) return NextResponse.json({ error: "장소를 찾을 수 없어요." }, { status: 404 });

  const dist = distanceM({ lat, lng }, place);
  if (dist > CHECKIN_RADIUS_M) {
    return NextResponse.json(
      { error: `장소에서 약 ${dist < 1000 ? Math.round(dist / 10) * 10 + "m" : (dist / 1000).toFixed(1) + "km"} 떨어져 있어요. 가게 근처(${CHECKIN_RADIUS_M}m 안)에서 다시 눌러 주세요.`, distance: Math.round(dist) },
      { status: 422 }
    );
  }

  let authUserId: string | null = null;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (token) authUserId = (await supabaseAdmin.auth.getUser(token)).data.user?.id ?? null;
  const userKey = !authUserId && typeof body.userKey === "string" && body.userKey.length <= 100 ? body.userKey : null;
  if (!authUserId && !userKey) return NextResponse.json({ error: "사용자 정보를 확인할 수 없어요." }, { status: 400 });

  // 같은 사람이 같은 장소를 하루에 여러 번 인증하지 못하게
  let dup = supabaseAdmin.from("place_checkins").select("id", { count: "exact", head: true })
    .eq("place_id", place.id).gte("created_at", kstTodayStartIso());
  dup = authUserId ? dup.eq("auth_user_id", authUserId) : dup.eq("user_key", userKey!);
  const { count: already, error: dupError } = await dup;
  if (dupError) {
    return NextResponse.json(
      { error: tableMissing(dupError.message) ? "방문 인증 기능이 아직 준비 중이에요(scripts/sql/place-checkins.sql 실행 필요)." : "방문 인증에 실패했어요." },
      { status: tableMissing(dupError.message) ? 503 : 500 }
    );
  }
  if ((already ?? 0) > 0) return NextResponse.json({ ok: true, already: true, placeName: place.name });

  const { error } = await supabaseAdmin.from("place_checkins").insert([{
    place_id: place.id,
    auth_user_id: authUserId,
    user_key: userKey,
    source: body.source === "walk" ? "walk" : "manual",
  }]);
  if (error) return NextResponse.json({ error: "방문 인증에 실패했어요." }, { status: 500 });
  return NextResponse.json({ ok: true, already: false, placeName: place.name });
}

export async function GET(req: NextRequest) {
  if (!allowGet(clientIp(req))) return NextResponse.json({ count: 0, verifiedReviewIds: [] }, { status: 429 });
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isFinite(placeId) || placeId <= 0) return NextResponse.json({ error: "placeId required" }, { status: 400 });

  const { data: checkins, error } = await supabaseAdmin
    .from("place_checkins").select("auth_user_id, user_key").eq("place_id", placeId).limit(5000);
  if (error || !checkins) return NextResponse.json({ count: 0, verifiedReviewIds: [] }); // 테이블 미생성 등 — 배지 없이 정상 동작

  const authIds = new Set(checkins.map((c) => c.auth_user_id).filter(Boolean));
  const userKeys = new Set(checkins.map((c) => c.user_key).filter(Boolean));
  // 누가 인증했는지(사용자 식별값)는 내려주지 않고, "방문 인증된 후기 번호"만 알려 줍니다.
  const { data: reviews } = await supabaseAdmin
    .from("reviews").select("id, auth_user_id, user_key").eq("place_id", placeId).eq("deleted", false).limit(2000);
  const verifiedReviewIds = (reviews || [])
    .filter((r) => (r.auth_user_id && authIds.has(r.auth_user_id)) || (r.user_key && userKeys.has(r.user_key)))
    .map((r) => r.id);
  return NextResponse.json({ count: checkins.length, verifiedReviewIds });
}
