// src/app/api/jebo/verify-images/route.ts
//
// POST /api/jebo/verify-images   body: { proposalId }
// 방금 접수된 제보 한 건의 필수 사진 2장을 AI로 판별하고, 확실히 적합하면 서버가 바로 지도에 등록합니다.
//
// ⚠ 예전엔 브라우저가 사진 주소를 보내 판정 결과를 받은 뒤, 브라우저가 직접 장소를 등록(approveProposal)
//    했습니다. 브라우저 값은 조작할 수 있어 아무 제보나 "자동 승인"으로 등록할 수 있었고, 아무 주소의
//    이미지를 서버가 받아오게 할 수도 있었습니다. 이제 브라우저는 제보 번호만 보내고, 서버가 DB에서
//    그 제보의 사진을 직접 꺼내 판정·등록까지 합니다.
//
// 보호
//   - 방금(30분 이내) 접수돼 아직 AI 판정을 받지 않은 "검토 대기" 제보만 처리합니다(같은 제보 재판정 불가).
//   - 우리 제보 사진 저장소(tip-images) 이미지만 판정합니다.
//   - AI 호출은 건당 비용이 들어 IP당 10분에 10회로 제한합니다.

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { manualReviewFallback, verifyTipImages } from "@/lib/server/aiImageVerify";
import { approveProposal } from "@/lib/approveProposal";
import { notifyAdmin } from "@/lib/server/notify";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ALLOWED_IMAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tip-images/`;
const FRESH_PROPOSAL_MS = 30 * 60_000;
const allow = createRateLimiter({ windowMs: 10 * 60_000, max: 10 });

function isAllowedImageUrl(url: unknown): url is string {
  return typeof url === "string" && url.length < 1000 && url.startsWith(ALLOWED_IMAGE_PREFIX) && !url.includes("..");
}

export type VerifyProposalResponse = {
  /** AI가 자동 승인 대상으로 판정했는지 */
  autoApprove: boolean;
  /** 실제로 지도에 등록까지 됐는지(좌표를 못 찾는 등으로 실패하면 false → 수동 검토) */
  approved: boolean;
  reasoning: string;
};

const reply = (body: VerifyProposalResponse, status = 200) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) {
    return reply({ autoApprove: false, approved: false, reasoning: "요청이 많아 AI 검증을 건너뜁니다." }, 429);
  }
  const { proposalId } = (await req.json().catch(() => ({}))) as { proposalId?: number };
  if (!Number.isInteger(proposalId)) {
    return reply({ autoApprove: false, approved: false, reasoning: "제보 번호가 없습니다." }, 400);
  }

  const { data: proposal } = await supabaseAdmin.from("proposals").select("*").eq("id", proposalId).maybeSingle();
  const fresh = proposal?.created_at && Date.now() - new Date(proposal.created_at).getTime() < FRESH_PROPOSAL_MS;
  if (!proposal || proposal.status !== "pending" || proposal.ai_review != null || !fresh) {
    return reply({ autoApprove: false, approved: false, reasoning: "검증 대상이 아닌 제보입니다." }, 400);
  }

  const [interiorUrl, petUrl] = Array.isArray(proposal.image_urls) ? proposal.image_urls : [];
  const verdict =
    isAllowedImageUrl(interiorUrl) && isAllowedImageUrl(petUrl)
      ? await verifyTipImages(interiorUrl, petUrl)
      : manualReviewFallback("필수 사진 2장이 없거나 허용되지 않은 주소라 검증을 건너뜁니다.");

  // 판정 기록은 관리자 제보관리 화면에서 볼 수 있게 남깁니다(수동 검토 때 참고).
  await supabaseAdmin.from("proposals").update({ ai_review: verdict }).eq("id", proposal.id);

  const tipLines = [proposal.place_name, proposal.address, proposal.is_owner_request ? "⭐ 인증된 사장님 본인 제보" : null];
  if (!verdict.autoApprove) {
    await notifyAdmin({ title: "📍 새 제보 — 검토 필요", lines: [...tipLines, `AI: ${verdict.reasoning}`], path: "/admin/tips" });
    return reply({ autoApprove: false, approved: false, reasoning: verdict.reasoning });
  }
  const result = await approveProposal(supabaseAdmin, proposal, { autoApprovedByAi: true });
  if (!result.ok) {
    console.error("[jebo/verify-images] AI 자동 승인 후 등록 실패 → 수동 검토:", result.reason);
  }
  await notifyAdmin({
    title: result.ok ? "📍 새 제보 — AI 확인 후 자동 등록됨" : "📍 새 제보 — 자동 등록 실패, 검토 필요",
    lines: tipLines,
    path: "/admin/tips",
  });
  return reply({ autoApprove: true, approved: result.ok, reasoning: verdict.reasoning });
}
