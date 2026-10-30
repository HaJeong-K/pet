import { NextRequest, NextResponse, after } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";
import { getPlaceMeta } from "@/lib/server/placeMeta";
import { cleanOrderModes } from "@/lib/storeRules";
import { isStoreEligibleCategory } from "@/lib/storeCategories";

// 쇼핑 입점 상담 — 같이가개에 가입한 사장님이면 누구나(인증 대기 포함).
//   GET  → 내 신청 상태와 미리 채울 가게 정보
//   POST → 상담 신청·수정 { placeId?, placeName, address, phone, orderModes, message }
// 승인은 관리자가 상담 후 합니다(/api/admin/store-partners).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function ownerOf(userId: string) {
  const { data } = await db.from("users").select("owner_status, owner_place_id, owner_business_name, owner_phone").eq("auth_user_id", userId).maybeSingle();
  return data;
}

export async function GET(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return NextResponse.json({ loggedIn: false });
  const [owner, partner] = await Promise.all([
    ownerOf(user.id),
    db.from("store_partners").select("status, place_name, place_address, place_phone, requested_place_id, order_modes, message, admin_note, linked_place_id").eq("owner_auth_user_id", user.id).maybeSingle(),
  ]);
  if (partner.error && isMissingSchema(partner.error)) return NextResponse.json({ loggedIn: true, ready: false });
  const isOwner = owner?.owner_status === "verified" || owner?.owner_status === "pending";
  return NextResponse.json({
    loggedIn: true, ready: true, isOwner, partner: partner.data ?? null,
    defaults: { placeName: owner?.owner_business_name ?? "", phone: owner?.owner_phone ?? "", placeId: owner?.owner_place_id ?? null },
  });
}

export async function POST(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return fail("로그인이 필요해요.", 401);
  const owner = await ownerOf(user.id);
  if (owner?.owner_status !== "verified" && owner?.owner_status !== "pending") return fail("사장님으로 가입한 뒤 상담을 신청할 수 있어요.", 403);

  const body = await req.json().catch(() => null);
  const placeName = text(body?.placeName, 60);
  if (!placeName) return fail("가게 이름을 적어 주세요.", 400);
  const phone = text(body?.phone, 20);
  if (!phone || phone.replace(/\D/g, "").length < 9) return fail("연락받을 전화번호를 확인해 주세요.", 400);
  const modes = cleanOrderModes(body?.orderModes);
  if (modes.length === 0) return fail("포장 주문과 매장 식사 중 하나 이상 골라 주세요.", 400);

  const rawPlace = Number(body?.placeId ?? owner?.owner_place_id);
  const placeId = Number.isInteger(rawPlace) && rawPlace > 0 ? rawPlace : null;
  // 지도에 있는 가게면 종류를 확인합니다(공원·병원·숙소 등은 입점 대상이 아님)
  if (placeId != null) {
    const meta = await getPlaceMeta(placeId);
    if (meta && !isStoreEligibleCategory(meta.category)) return fail("쇼핑 입점은 카페·식당·간식·용품 가게가 대상이에요.", 400);
  }

  const { data: current, error: findError } = await db.from("store_partners").select("id, status").eq("owner_auth_user_id", user.id).maybeSingle();
  if (findError) return fail(isMissingSchema(findError) ? "입점 상담을 준비하고 있어요." : findError.message, isMissingSchema(findError) ? 503 : 500);

  const now = new Date().toISOString();
  const row = { requested_place_id: placeId, place_name: placeName, place_address: text(body?.address, 200), place_phone: phone, order_modes: modes, message: text(body?.message, 500), updated_at: now };

  if (current?.status === "approved") {
    // 입점한 뒤에는 받을 방식만 바꿀 수 있습니다
    const { error } = await db.from("store_partners").update({ order_modes: modes, updated_at: now }).eq("id", current.id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true, status: "approved" });
  }
  const { error } = current
    ? await db.from("store_partners").update({ ...row, status: "pending", admin_note: null }).eq("id", current.id)
    : await db.from("store_partners").insert([{ ...row, owner_auth_user_id: user.id }]);
  if (error) return fail(error.message, 500);
  after(() => notifyAdmin({ title: "🛍 쇼핑 입점 상담 신청", lines: [placeName, phone], path: "/admin/stays" }));
  return NextResponse.json({ ok: true, status: "pending" });
}
