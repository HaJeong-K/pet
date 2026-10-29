// src/lib/server/premiumRenew.ts
//
// 매일 새벽 작업(/api/cron/daily)의 "요금제 자동 연장".
//   · 자동 연장으로 정한 가게: 만료 3일 전에 같은 요금제·개월 수로 연장 신청을 넣고(관리자 입금 확인 → 승인),
//     사장님 기기로 "자동 연장 신청이 접수됐어요" 알림
//   · 아직 정하지 않은 가게: 만료 7일 전에 "자동 연장 여부를 정해 주세요" 알림 한 번
// 규칙은 src/lib/premiumRenew.ts, 표는 premium_auto_renew(scripts/sql/premium-auto-renew.sql).

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { createPremiumRequest } from "@/lib/server/premiumRequest";
import { renewAction, RENEW_REMIND_DAYS, type RenewRow } from "@/lib/premiumRenew";
import { normalizePlan, PLAN_NAME } from "@/lib/ownerPlans";

const DAY = 86_400_000;
const shortDate = (iso: string) => { const d = new Date(new Date(iso).getTime() + 9 * 3_600_000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export async function runPremiumAutoRenew(): Promise<{ filed: number; reminded: number; skipped?: string }> {
  const now = Date.now();
  // 만료가 7일 안으로 남은 이용 중인 가게
  const { data: places, error } = await db.from("places").select("id, premium_expires_at, premium_plan")
    .eq("is_premium", true).gt("premium_expires_at", new Date(now).toISOString()).lte("premium_expires_at", new Date(now + (RENEW_REMIND_DAYS + 1) * DAY).toISOString());
  if (error) throw new Error(error.message);
  if (!places?.length) return { filed: 0, reminded: 0 };

  const { data: rows, error: rowError } = await db.from("premium_auto_renew").select("place_id, enabled, plan, months, reminded_for, renewed_for").in("place_id", places.map((p) => p.id));
  if (rowError) { if (isMissingSchema(rowError)) return { filed: 0, reminded: 0, skipped: "premium-auto-renew.sql 실행 전" }; throw new Error(rowError.message); }
  const rowOf = new Map((rows ?? []).map((r) => [Number(r.place_id), r as RenewRow & { plan: string | null; months: number }]));

  let filed = 0, reminded = 0;
  for (const p of places) {
    const placeId = Number(p.id);
    const row = rowOf.get(placeId) ?? null;
    const action = renewAction(p.premium_expires_at, row, now);
    if (!action) continue;
    const expiryDay = String(p.premium_expires_at).slice(0, 10);

    if (action === "remind") {
      await db.from("premium_auto_renew").upsert({ place_id: placeId, reminded_for: expiryDay, updated_at: new Date().toISOString() }, { onConflict: "place_id" });
      await sendOwnerPush(placeId, {
        title: "요금제 이용 기간이 곧 끝나요",
        body: `${shortDate(p.premium_expires_at)}에 끝나요. 기한이 끝나면 자동으로 연장할지 사장님 센터에서 정해 주세요.`,
        tag: `ggk-renew-${placeId}-${expiryDay}`, url: "/owner#ads",
      }).catch(() => 0);
      reminded++;
      continue;
    }

    // 자동 연장 신청 — 신청은 그 가게의 인증된 사장님 이름으로 넣습니다
    const { data: owner } = await db.from("users").select("auth_user_id").eq("owner_status", "verified").eq("owner_place_id", placeId).limit(1).maybeSingle();
    if (!owner?.auth_user_id) continue;
    const plan = normalizePlan(row?.plan ?? p.premium_plan);
    const months = Math.min(12, Math.max(1, Number(row?.months) || 1));
    const result = await createPremiumRequest({ placeId, ownerUserId: owner.auth_user_id, plan, months, payerName: null, memo: "자동 연장 신청", auto: true });
    // 이미 대기 중인 신청이 있어도(사장님이 직접 넣음) 이번 만료일은 처리한 것으로 둡니다
    if (result.ok || result.status === 409) {
      await db.from("premium_auto_renew").update({ renewed_for: expiryDay, updated_at: new Date().toISOString() }).eq("place_id", placeId);
    }
    if (result.ok) {
      await sendOwnerPush(placeId, {
        title: "요금제 자동 연장 신청이 접수됐어요",
        body: `${PLAN_NAME[plan]} ${months}개월 연장을 신청했어요.${result.total > 0 ? " 입금 안내를 확인해 주세요." : ""} 연장을 원하지 않으면 사장님 센터에서 끌 수 있어요.`,
        tag: `ggk-renew-filed-${placeId}-${expiryDay}`, url: "/owner#ads",
      }).catch(() => 0);
      filed++;
    }
  }
  return { filed, reminded };
}
