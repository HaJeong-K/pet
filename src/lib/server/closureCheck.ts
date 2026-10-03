// src/lib/server/closureCheck.ts
//
// 폐업 자동 점검(주 1회, /api/cron/daily). 인증된 사장님들의 사업자번호로 국세청 영업 상태를 조회해서
//   - 폐업(03): 사장님 권한 회수(owner_status → rejected, 업장 연결 해제) + 그 장소를 신고 목록에
//               "폐업" 신고로 올림(관리자가 장소 삭제 여부를 최종 판단) + 관리자 알림
//   - 휴업(02): 관리자 알림만(곧 다시 열 수 있어 권한은 유지)
// 지도 정보가 오래돼 "가 보니 문을 닫았다"는 경험을 줄이기 위한 자동화입니다.
// 장소를 자동으로 지우지는 않습니다(국세청 폐업 = 그 사업자 폐업이지, 같은 자리에 새 사업자가 이어서
// 운영할 수도 있어서 사람이 확인합니다).

import { createClient } from "@supabase/supabase-js";
import { fetchBusinessStatuses } from "@/lib/server/ntsBusiness";
import { notifyAdmin } from "@/lib/server/notify";

const SYSTEM_REPORTER = "system:closure-check";

export async function runClosureCheck(): Promise<{ checked: number; closed: number; suspended: number; skipped?: string }> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: owners, error } = await admin
    .from("users")
    .select("auth_user_id, owner_biz_no, owner_business_name, owner_place_id")
    .eq("owner_status", "verified")
    .not("owner_biz_no", "is", null);
  if (error) throw new Error(error.message);
  if (!owners || owners.length === 0) return { checked: 0, closed: 0, suspended: 0 };

  const result = await fetchBusinessStatuses(owners.map((o) => o.owner_biz_no as string));
  if (!result.ok) {
    // 국세청 API 미신청·장애는 실패로 보지 않고 건너뜁니다(다음 주에 다시 시도).
    return { checked: 0, closed: 0, suspended: 0, skipped: result.reason };
  }
  const byNo = new Map(result.statuses.map((s) => [s.bizNo, s]));

  let closed = 0;
  let suspended = 0;
  for (const owner of owners) {
    const status = byNo.get(owner.owner_biz_no as string);
    if (!status) continue;
    const shop = owner.owner_business_name || "(가게명 없음)";

    if (status.code === "03") {
      closed++;
      await admin
        .from("users")
        .update({ owner_status: "rejected", owner_place_id: null })
        .eq("auth_user_id", owner.auth_user_id);
      if (owner.owner_place_id != null) {
        const { data: place } = await admin.from("places").select("name, address").eq("id", owner.owner_place_id).maybeSingle();
        // 같은 장소에 시스템 폐업 신고가 이미 열려 있으면 또 만들지 않습니다.
        const { count } = await admin
          .from("reports")
          .select("*", { count: "exact", head: true })
          .eq("place_id", owner.owner_place_id)
          .eq("reporter_key", SYSTEM_REPORTER)
          .eq("is_resolved", false);
        if (!count) {
          await admin.from("reports").insert([{
            type: "place",
            target_id: String(owner.owner_place_id),
            place_id: owner.owner_place_id,
            place_name: place?.name ?? shop,
            place_address: place?.address ?? null,
            reporter_key: SYSTEM_REPORTER,
            nickname: "자동 점검",
            report_category: "closed",
            report_reason: `국세청 영업 상태 조회 결과 '${status.text || "폐업자"}'로 확인되어 사장님 권한을 회수했어요. 장소 삭제 여부를 확인해 주세요.`,
          }]);
        }
      }
      await notifyAdmin({
        title: "🚪 폐업 확인 — 사장님 권한 회수",
        lines: [shop, `국세청 상태: ${status.text || "폐업자"}`, owner.owner_place_id != null ? "연결된 장소를 신고 목록에 올렸어요" : null],
        path: "/admin/reports",
      });
    } else if (status.code === "02") {
      suspended++;
      await notifyAdmin({
        title: "⏸️ 휴업 확인",
        lines: [shop, `국세청 상태: ${status.text || "휴업자"}`, "권한은 유지돼요 — 필요하면 장소 정보를 확인해 주세요"],
        path: "/admin/owners",
      });
    }
  }
  return { checked: owners.length, closed, suspended };
}
