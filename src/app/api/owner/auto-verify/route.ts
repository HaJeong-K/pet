import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateBusiness } from "@/lib/server/ntsBusiness";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { notifyAdmin } from "@/lib/server/notify";
import { bizNamesMatch, isCompleteBizInfo, onlyDigits, type OwnerBizInfo } from "@/lib/ownerBizInfo";

// POST /api/owner/auto-verify   (Authorization: Bearer <로그인 토큰>)
// body: { bizNo, ownerName, openDate }
//
// 사장님 자동 인증 — 서버가 국세청 진위확인으로 판정합니다.
// ⚠ 예전엔 브라우저가 사업자등록증 OCR 결과를 보고 스스로 "인증됨"을 DB에 썼습니다. 브라우저 값은
//    조작할 수 있어서 누구나 인증된 사장님이 될 수 있었고, 이제 인증 확정은 이 서버 API만 합니다
//    (DB 트리거 scripts/sql/protect-privileged-columns.sql이 브라우저의 직접 변경도 막음).
//
// 판정 규칙
//   1) 국세청 등록 정보(사업자번호·개업일자·대표자명)와 일치 + 계속사업자(휴·폐업 아님) → 즉시 인증
//   2) 같은 사업자번호로 이미 인증된 다른 계정이 있으면 → 관리자 검토(명의 도용·중복 방지)
//   3) 국세청 조회 불가(키 미신청·장애) 또는 불일치 → 관리자 검토(owner_status 'pending' 유지)
//   업장 연결(owner_place_id)은 지도에서 고른 업장 이름이 신청한 가게 이름과 비슷할 때만 유지합니다
//   — 내 사업자로 인증받고 남의 가게 수정 권한을 가져가는 것을 막기 위함입니다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 국세청 조회를 반복 시도해 정보를 맞혀 보는 것을 막습니다(IP당 10분에 5회).
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });

type Outcome = "verified" | "pending";
const reply = (outcome: Outcome, message: string, status = 200) =>
  NextResponse.json({ outcome, message }, { status });

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return reply("pending", "요청이 많아요. 잠시 후 다시 시도해 주세요.", 429);

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return reply("pending", "로그인이 필요해요.", 401);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return reply("pending", "로그인 정보가 올바르지 않아요.", 401);

  const body = (await req.json().catch(() => ({}))) as Partial<OwnerBizInfo>;
  const info: OwnerBizInfo = {
    bizNo: onlyDigits(String(body.bizNo || "")),
    ownerName: String(body.ownerName || "").trim().slice(0, 30),
    openDate: onlyDigits(String(body.openDate || "")),
  };
  if (!isCompleteBizInfo(info)) return reply("pending", "사업자 정보를 다시 확인해 주세요.", 400);

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("owner_status, owner_business_name, owner_place_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) return reply("pending", "가입 정보를 찾을 수 없어요.", 404);
  if (profile.owner_status === "verified") return reply("verified", "이미 인증된 사장님 계정이에요.");
  if (profile.owner_status !== "pending") return reply("pending", "사장님 신청 상태가 아니에요.", 400);

  // 결과를 관리자에게 알립니다 — 자동 인증은 기록용, 검토 대기는 처리 요청.
  const shopName = profile.owner_business_name || "(가게명 없음)";
  const alertPending = (reason: string) =>
    notifyAdmin({ title: "🏪 사장님 신청 — 확인 필요", lines: [shopName, reason], path: "/admin/owners" });

  // 사업자번호는 인증 결과와 상관없이 저장 — 관리자 수동 검토 때 대조용
  await supabaseAdmin.from("users").update({ owner_biz_no: info.bizNo }).eq("auth_user_id", user.id);

  const { data: dup } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("owner_biz_no", info.bizNo)
    .eq("owner_status", "verified")
    .neq("auth_user_id", user.id)
    .limit(1);
  if (dup && dup.length > 0) {
    await alertPending("같은 사업자번호로 이미 인증된 계정 있음");
    return reply("pending", "같은 사업자번호로 이미 인증된 계정이 있어 관리자 확인 후 승인돼요.");
  }

  const nts = await validateBusiness(info);
  if (!nts.ok) {
    await alertPending(nts.reason === "key_not_approved" ? "국세청 API 미신청 — 수동 확인" : "국세청 조회 실패 — 수동 확인");
    return reply("pending", "국세청 자동 확인을 지금 할 수 없어 관리자 확인 후 승인돼요.");
  }
  if (!nts.valid) {
    await alertPending("국세청 등록 정보와 불일치");
    return reply("pending", "입력한 사업자 정보가 국세청 등록 정보와 달라 관리자 확인 후 승인돼요.");
  }
  if (!nts.active) {
    await alertPending(`국세청 상태: ${nts.statusText || "영업 중 아님"}`);
    return reply("pending", `국세청에 '${nts.statusText || "영업 중 아님"}'으로 확인되어 관리자 확인 후 승인돼요.`);
  }

  // 지도에서 고른 업장이 신청한 가게와 같은 곳으로 보일 때만 연결 유지
  let placeId: number | null = profile.owner_place_id ?? null;
  if (placeId != null) {
    const { data: place } = await supabaseAdmin.from("places").select("name").eq("id", placeId).maybeSingle();
    if (!place || !bizNamesMatch(place.name, profile.owner_business_name || "")) placeId = null;
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ owner_status: "verified", owner_auto_verified: true, owner_place_id: placeId })
    .eq("auth_user_id", user.id)
    .eq("owner_status", "pending");
  if (error) {
    console.error("[owner/auto-verify] 인증 저장 실패:", error.message);
    await alertPending("자동 인증 저장 실패");
    return reply("pending", "인증 저장 중 오류가 나서 관리자 확인 후 승인돼요.", 500);
  }

  await notifyAdmin({
    title: "✅ 사장님 자동 인증 완료",
    lines: [shopName, placeId == null && profile.owner_place_id != null ? "고른 업장 이름이 달라 업장 연결은 보류 — 확인 필요" : null],
    path: "/admin/owners",
  });
  return reply(
    "verified",
    placeId == null && profile.owner_place_id != null
      ? "국세청 확인이 완료되어 사장님 인증이 끝났어요. 고르신 업장은 가게 이름이 달라 관리자가 확인 후 연결해 드려요."
      : "국세청 확인이 완료되어 사장님 인증이 끝났어요."
  );
}
