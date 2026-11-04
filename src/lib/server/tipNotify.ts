// src/lib/server/tipNotify.ts
//
// 제보가 지도에 반영되면 제보한 회원에게 알립니다(마이페이지 알림함 + 알림을 켠 기기).
//   · 새 장소 제보 승인 → "제보하신 장소가 지도에 올라갔어요"
//   · 정보 추가 제안 승인 → "제안하신 정보가 반영됐어요"
// 비회원 제보는 연락할 방법이 없어 보내지 않습니다. 같은 제보로 두 번 보내지 않습니다.
// 관리자 수동 승인(/api/admin/notify-tip)과 AI 자동 승인(/api/jebo/verify-images)이 함께 씁니다.

import { db } from "@/lib/server/ownerStore";
import { notifyGuest } from "@/lib/server/guestNotify";
import { POINT_RULES } from "@/lib/memberLevel";

export async function notifyTipApproved(proposalId: number): Promise<"sent" | "skipped"> {
  const { data: p } = await db.from("proposals").select("id, place_name, place_id, auth_user_id, status, proposal_kind").eq("id", proposalId).maybeSingle();
  if (!p || p.status !== "approved" || !p.auth_user_id) return "skipped";
  const infoUpdate = p.proposal_kind === "info_update";
  const kind = infoUpdate ? "tip_info_applied" : "tip_approved";
  const url = p.place_id ? `/place/${p.place_id}` : "/";
  const { count } = await db.from("user_notifications").select("id", { count: "exact", head: true }).eq("auth_user_id", p.auth_user_id).eq("kind", kind).eq("url", url);
  if ((count ?? 0) > 0) return "skipped";
  const points = POINT_RULES[infoUpdate ? "info_update_approved" : "tip_approved"].points;
  await notifyGuest(p.auth_user_id, {
    kind,
    title: infoUpdate ? "제안하신 정보가 반영됐어요" : "제보하신 장소가 지도에 올라갔어요",
    body: `${p.place_name} · 레벨 점수 ${points}점을 받았어요. 함께 지도를 채워 주셔서 고마워요.`,
    url,
  });
  return "sent";
}
