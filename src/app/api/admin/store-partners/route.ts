import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { kstToday } from "@/lib/lodgingBooking";

// 관리자 전용: 쇼핑 입점 상담
//   GET  → 신청 목록(새 신청 먼저) + 사장님 인증 상태
//   POST { id, action: "consulting" | "approve" | "reject", note }
//     approve: 사장님 인증이 끝난 계정만. 고른 가게를 연결하고 쇼핑 탭·장소 상세에 엽니다.
//       공공데이터 가게(번호 10억 이상)면 같이가개 장소로 옮겨 만들고 원래 칸은 지도에서 숨깁니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const PUBLIC_ID_MIN = 1_000_000_000;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const { data, error } = await db.from("store_partners").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, partners: [] }) : fail(error.message, 500);
  const rows = data ?? [];
  const ids = rows.map((r) => r.owner_auth_user_id);
  const { data: owners } = ids.length ? await db.from("users").select("auth_user_id, email, owner_status, owner_business_name").in("auth_user_id", ids) : { data: [] };
  const order: Record<string, number> = { pending: 0, consulting: 1, approved: 2, rejected: 3 };
  const partners = rows.map((r) => ({ ...r, owner: (owners ?? []).find((o) => o.auth_user_id === r.owner_auth_user_id) ?? null }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return NextResponse.json({ ready: true, partners });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("관리자 권한 없음", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  const { data: row } = await db.from("store_partners").select("*").eq("id", id).maybeSingle();
  if (!row) return fail("신청을 찾을 수 없어요.", 404);
  const now = new Date().toISOString();

  if (body?.action === "consulting") {
    const { error } = await db.from("store_partners").update({ status: "consulting", admin_note: note ?? row.admin_note, updated_at: now }).eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (body?.action === "reject") {
    if (!note) return fail("사유를 적어 주세요(사장님에게 보여요).", 400);
    const { error } = await db.from("store_partners").update({ status: "rejected", admin_note: note, decided_at: now, updated_at: now }).eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (body?.action !== "approve") return fail("요청이 올바르지 않아요.", 400);

  const { data: owner } = await db.from("users").select("owner_status, owner_place_id").eq("auth_user_id", row.owner_auth_user_id).maybeSingle();
  if (owner?.owner_status !== "verified") return fail("사장님 인증이 끝난 계정만 입점할 수 있어요. 먼저 사장님 승인을 해 주세요.", 409);

  const requested = row.requested_place_id != null ? Number(row.requested_place_id) : owner.owner_place_id != null ? Number(owner.owner_place_id) : null;
  if (requested == null) return fail("지도에 없는 가게예요. 먼저 제보로 장소를 등록하고 사장님 가게로 연결해 주세요.", 409);
  let linked = requested;
  if (requested >= PUBLIC_ID_MIN) {
    const source = (await getMergedPublicDataPlaces()).find((p) => Number(p.id) === requested);
    if (!source) return fail("고른 공공데이터 가게를 찾지 못했어요(목록에서 빠졌을 수 있어요).", 404);
    const lat = Number(source.lat), lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("이 가게는 좌표가 없어 옮길 수 없어요.", 409);
    const { data: created, error } = await db.from("places").insert([{
      name: row.place_name || source.name, address: row.place_address || source.address, lat, lng,
      category: source.category ?? "카페", pet_zone: source.pet_zone ?? null, large_dog: source.large_dog ?? null,
      phone: row.place_phone || source.phone || null, image_url: source.image_url && !String(source.image_url).includes("default-place") ? source.image_url : null,
      memo: source.memo ?? null, hours: source.hours ?? null, website: source.website ?? null,
    }]).select("id").single();
    if (error || !created) return fail(`장소를 만들지 못했어요: ${error?.message ?? ""}`, 500);
    linked = Number(created.id);
    await db.from("hidden_public_places").upsert([{ place_id: requested, reason: `쇼핑 입점으로 같이가개 장소 #${linked}로 옮김`, hidden_by: admin.email || admin.id }], { onConflict: "place_id" });
  }

  const { error: userError } = await db.from("users").update({ owner_place_id: linked }).eq("auth_user_id", row.owner_auth_user_id);
  if (userError) return fail(userError.message, 500);
  const { error } = await db.from("store_partners").update({ status: "approved", linked_place_id: linked, partner_since: kstToday(), admin_note: note, decided_at: now, updated_at: now }).eq("id", id);
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true, linkedPlaceId: linked });
}
