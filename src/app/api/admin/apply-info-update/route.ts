import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { applyInfoUpdateProposal } from "@/lib/applyInfoUpdateProposal";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";

// 관리자 전용: "정보 추가 제안"(proposal_kind = info_update) 승인 → 장소에 반영
//   POST { proposalId }
// 예전엔 관리자 화면(브라우저)이 직접 반영했는데, 공공데이터 장소를 실제 행으로 올린 뒤
// 원래 장소를 숨기는 단계(hidden_public_places 쓰기)가 브라우저 권한으로는 막혀 조용히 실패했습니다.
// 그 결과 "반영되었습니다"가 떠도 정보가 빈 원래 장소가 그대로 보였습니다. 그래서 서버 권한으로 옮겼습니다.

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { proposalId?: number | string };
  const proposalId = Number(body.proposalId);
  if (!Number.isFinite(proposalId) || proposalId <= 0) return NextResponse.json({ error: "proposalId required" }, { status: 400 });

  // 반영할 내용은 화면이 보낸 값이 아니라 DB에 저장된 제안에서 읽습니다.
  const { data: proposal, error } = await supabaseAdmin.from("proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!proposal || proposal.proposal_kind !== "info_update" || !proposal.place_id) {
    return NextResponse.json({ error: "정보 추가 제안을 찾을 수 없어요." }, { status: 404 });
  }

  const result = await applyInfoUpdateProposal(supabaseAdmin, proposal, async (id) =>
    (await getMergedPublicDataPlaces()).find((p) => p.id === id) ?? null
  );
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { status: result.reason === "place_not_found" ? 404 : 500 });

  await supabaseAdmin.from("proposals").update({ status: "approved", is_resolved: true }).eq("id", proposalId);
  return NextResponse.json({ ok: true, mode: result.mode });
}
