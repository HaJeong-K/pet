import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { kstToday } from "@/lib/lodgingBooking";
import { promoLastDay } from "@/lib/lodgingPolicy";

// 관리자 전용: 숙소 입점 신청 심사(「같이가개 숙소 입점 계약서」 제5조)
//   GET  → 신청 목록(대기 먼저) + 영업신고증 10분짜리 열람 주소 + 사장님 정보
//   POST { id, action: "approve" | "reject", note }
//     approve: 고른 숙소를 사장님 숙소로 연결하고 입점일을 오늘로 정합니다(그날부터 3개월 수수료 5%).
//       · 공공데이터 숙소(번호 10억 이상)면 같이가개 장소로 옮겨 만들고, 원래 공공데이터 칸은 지도에서 숨깁니다.
//       · 지도에 없는 숙소면 먼저 제보로 장소를 등록한 뒤 승인해 주세요.
//     reject : 사유와 함께 반려(사장님이 고쳐서 다시 신청할 수 있음)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const SIGNED_URL_SECONDS = 600;
const PUBLIC_ID_MIN = 1_000_000_000;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const { data, error } = await db.from("lodging_partners").select("*").order("status", { ascending: false }).order("created_at", { ascending: true }).limit(300);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, partners: [] }) : fail(error.message, 500);
  const rows = data ?? [];
  const userIds = rows.map((r) => r.owner_auth_user_id);
  const { data: owners } = userIds.length ? await db.from("users").select("auth_user_id, email, owner_business_name, owner_phone, owner_biz_no").in("auth_user_id", userIds) : { data: [] as any[] };
  const partners = await Promise.all(rows.map(async (r) => {
    const signed = r.license_path ? await db.storage.from("owner-docs").createSignedUrl(r.license_path, SIGNED_URL_SECONDS) : null;
    return { ...r, licenseUrl: signed?.data?.signedUrl ?? null, owner: (owners ?? []).find((o) => o.auth_user_id === r.owner_auth_user_id) ?? null };
  }));
  // 대기 중인 신청을 맨 위로
  partners.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  return NextResponse.json({ ready: true, partners });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("관리자 권한 없음", 401);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  const { data: row } = await db.from("lodging_partners").select("*").eq("id", id).maybeSingle();
  if (!row) return fail("신청을 찾을 수 없어요.", 404);
  if (row.status !== "pending") return fail("대기 중인 신청이 아니에요.", 409);
  const now = new Date().toISOString();

  if (body?.action === "reject") {
    if (!note) return fail("반려 사유를 적어 주세요(사장님에게 보여요).", 400);
    const { error } = await db.from("lodging_partners").update({ status: "rejected", admin_note: note, decided_at: now, updated_at: now }).eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (body?.action !== "approve") return fail("요청이 올바르지 않아요.", 400);

  // 연결할 같이가개 장소 정하기
  let linked: number | null = null;
  const requested = row.requested_place_id == null ? null : Number(row.requested_place_id);
  if (requested == null) return fail("지도에 없는 숙소예요. 먼저 제보로 장소를 등록한 뒤, 사장님께 그 장소를 골라 다시 신청해 달라고 해 주세요.", 409);
  if (requested < PUBLIC_ID_MIN) {
    linked = requested;
  } else {
    // 공공데이터 숙소 → 같이가개 장소로 옮겨 만들기
    const source = (await getMergedPublicDataPlaces()).find((p) => Number(p.id) === requested);
    if (!source) return fail("고른 공공데이터 숙소를 찾지 못했어요(목록에서 빠졌을 수 있어요).", 404);
    const lat = Number(source.lat), lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("이 숙소는 좌표가 없어 옮길 수 없어요.", 409);
    const { data: created, error } = await db.from("places").insert([{
      name: row.place_name || source.name, address: row.place_address || source.address, lat, lng,
      category: source.category ?? "숙박", pet_zone: source.pet_zone ?? null, large_dog: source.large_dog ?? null,
      phone: row.place_phone || source.phone || null, image_url: source.image_url && !String(source.image_url).includes("default-place") ? source.image_url : null,
      memo: source.memo ?? null, hours: source.hours ?? null, website: source.website ?? null,
    }]).select("id").single();
    if (error || !created) return fail(`장소를 만들지 못했어요: ${error?.message ?? ""}`, 500);
    linked = Number(created.id);
    // 같은 숙소가 지도에 두 번 나오지 않게 원래 공공데이터 칸은 숨깁니다(후기 등 기록은 지우지 않음).
    await db.from("hidden_public_places").upsert([{ place_id: requested, reason: `숙소 입점으로 같이가개 장소 #${linked}로 옮김`, hidden_by: admin.email || admin.id }], { onConflict: "place_id" });
  }

  const today = kstToday();
  const { error: userError } = await db.from("users").update({ owner_place_id: linked }).eq("auth_user_id", row.owner_auth_user_id);
  if (userError) return fail(userError.message, 500);
  const { error } = await db.from("lodging_partners").update({
    status: "approved", linked_place_id: linked, partner_since: today, admin_note: note, decided_at: now, updated_at: now,
  }).eq("id", id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true, linkedPlaceId: linked, partnerSince: today, promoLastDay: promoLastDay(today) });
}
