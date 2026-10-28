import { NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { notifyAdmin } from "@/lib/server/notify";
import { ownerKindOf } from "@/lib/ownerKind";
import { LODGING_CONTRACT_VERSION, promoLastDay } from "@/lib/lodgingPolicy";

// 숙소 입점 신청(「같이가개 숙소 입점 계약서」 제5조) — 인증된 "숙소" 사장님 본인만
//   GET  → 내 입점 신청 상태 { ready, partner: { status, place_name, partner_since, promoLastDay, admin_note } | null }
//   POST (multipart) → 신청·다시 신청
//        placeId(선택, 지도에서 고른 숙소 번호 — 공공데이터 숙소도 됨), placeName, placeAddress, placePhone,
//        bankName, accountNumber, accountHolder, agreed=true, license(숙박업 영업신고증 사진·PDF, 처음 신청 때 필수)
// 영업신고증은 비공개 보관함(owner-docs)에 넣고 관리자 화면에서만 잠깐 열리는 주소로 봅니다.
// 승인·연결은 관리자가 /api/admin/lodging-partners에서 합니다.

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEED_SQL = "입점 신청을 준비하고 있어요. 잠시 후 다시 시도해 주세요.";
const MAX_BYTES = 10 * 1024 * 1024;

/** 파일 앞머리로 종류 확인 — JPG·PNG·WEBP·PDF만 */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", ext: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return { type: "image/webp", ext: "webp" };
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { type: "application/pdf", ext: "pdf" };
  return null;
}

async function lodgingOwner(req: NextRequest) {
  const user = await userOf(req);
  if (!user) return { error: "로그인이 필요해요.", status: 401 } as const;
  const { data } = await db.from("users").select("owner_status, owner_kind, owner_place_id, owner_business_name, owner_phone").eq("auth_user_id", user.id).maybeSingle();
  if (data?.owner_status !== "verified") return { error: "사장님 인증을 마친 뒤 입점 신청을 할 수 있어요.", status: 403 } as const;
  if (ownerKindOf(data?.owner_kind) !== "lodging") return { error: "숙소 사장님 계정에서만 입점 신청을 할 수 있어요.", status: 403 } as const;
  return { userId: user.id, profile: data };
}

export async function GET(req: NextRequest) {
  const owner = await lodgingOwner(req);
  if ("error" in owner) return fail(owner.error!, owner.status!);
  const { data, error } = await db.from("lodging_partners")
    .select("status, requested_place_id, place_name, place_address, place_phone, bank_name, account_holder, partner_since, linked_place_id, admin_note, created_at")
    .eq("owner_auth_user_id", owner.userId).maybeSingle();
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, partner: null }) : fail(error.message, 500);
  return NextResponse.json({
    ready: true,
    contractVersion: LODGING_CONTRACT_VERSION,
    linkedPlaceId: owner.profile.owner_place_id ?? null,
    partner: data ? { ...data, promoLastDay: data.partner_since ? promoLastDay(data.partner_since) : null } : null,
  });
}

export async function POST(req: NextRequest) {
  const owner = await lodgingOwner(req);
  if ("error" in owner) return fail(owner.error!, owner.status!);
  const form = await req.formData().catch(() => null);
  if (!form) return fail("신청 내용을 다시 확인해 주세요.", 400);
  const text = (key: string, max: number) => (typeof form.get(key) === "string" ? String(form.get(key)).trim().slice(0, max) : "");
  if (form.get("agreed") !== "true") return fail("입점 계약서에 동의해 주세요.", 400);
  const placeName = text("placeName", 60);
  const bankName = text("bankName", 30);
  const accountNumber = text("accountNumber", 30).replace(/[^\d-]/g, "");
  const accountHolder = text("accountHolder", 30);
  if (!placeName) return fail("숙소 이름을 적어 주세요.", 400);
  if (!bankName || accountNumber.replace(/\D/g, "").length < 8 || !accountHolder) return fail("정산받을 계좌(은행·계좌번호·예금주)를 확인해 주세요.", 400);
  const placeIdRaw = Number(text("placeId", 20));
  const requestedPlaceId = Number.isInteger(placeIdRaw) && placeIdRaw > 0 ? placeIdRaw : owner.profile.owner_place_id ?? null;

  const { data: existing, error: findError } = await db.from("lodging_partners").select("status, license_path").eq("owner_auth_user_id", owner.userId).maybeSingle();
  if (findError) return fail(isMissingSchema(findError) ? NEED_SQL : findError.message, isMissingSchema(findError) ? 503 : 500);
  if (existing?.status === "approved") return fail("이미 입점이 승인됐어요. 정보 변경은 관리자에게 문의해 주세요.", 409);

  // 영업신고증 — 처음 신청이면 필수, 다시 신청할 때는 새로 올리지 않으면 예전 것을 씁니다.
  let licensePath: string | null = existing?.license_path ?? null;
  const file = form.get("license");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return fail("영업신고증 파일은 10MB까지 올릴 수 있어요.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return fail("영업신고증은 사진(JPG·PNG·WEBP)이나 PDF로 올려 주세요.", 400);
    const path = `lodging-license/${owner.userId}/${randomUUID()}.${kind.ext}`;
    const { error } = await db.storage.from("owner-docs").upload(path, bytes, { contentType: kind.type });
    if (error) return fail(`파일을 올리지 못했어요: ${error.message}`, 500);
    licensePath = path;
  }
  if (!licensePath) return fail("숙박업 영업신고증을 올려 주세요.", 400);

  const now = new Date().toISOString();
  const { error } = await db.from("lodging_partners").upsert({
    owner_auth_user_id: owner.userId, requested_place_id: requestedPlaceId, place_name: placeName,
    place_address: text("placeAddress", 120) || null, place_phone: text("placePhone", 20) || owner.profile.owner_phone || null,
    status: "pending", license_path: licensePath, bank_name: bankName, account_number: accountNumber, account_holder: accountHolder,
    contract_version: LODGING_CONTRACT_VERSION, agreed_at: now, admin_note: null, updated_at: now,
  }, { onConflict: "owner_auth_user_id" });
  if (error) return fail(error.message, 500);
  after(() => notifyAdmin({ title: "🏨 숙소 입점 신청", lines: [placeName, requestedPlaceId ? `지도 숙소 #${requestedPlaceId}` : "지도에 없는 숙소", owner.profile.owner_business_name], path: "/admin/stays" }));
  return NextResponse.json({ ok: true });
}
