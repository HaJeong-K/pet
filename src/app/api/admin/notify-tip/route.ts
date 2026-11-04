import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { notifyTipApproved } from "@/lib/server/tipNotify";

// 관리자 전용: 제보를 승인한 뒤 제보한 회원에게 반영 알림을 보냅니다.
//   POST { proposalId } — 승인된 제보만, 같은 제보로는 한 번만 보냅니다(src/lib/server/tipNotify.ts).

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { proposalId?: number | string };
  const proposalId = Number(body.proposalId);
  if (!Number.isInteger(proposalId) || proposalId <= 0) return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  return NextResponse.json({ result: await notifyTipApproved(proposalId) });
}
