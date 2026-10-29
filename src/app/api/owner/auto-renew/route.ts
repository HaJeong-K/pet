import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, ownerContext } from "@/lib/server/ownerStore";
import { normalizePlan } from "@/lib/ownerPlans";
import { RENEW_MONTH_OPTIONS } from "@/lib/premiumRenew";

// 요금제 자동 연장 설정(scripts/sql/premium-auto-renew.sql)
//   GET → { ready, enabled(true/false/null=안 정함), plan, months, expiresAt, currentPlan }  — 관리자 미리보기(?placeId=)도 볼 수 있음
//   PUT { enabled, plan?, months? } → 저장. 돈이 오가는 설정이라 사장님 본인만 바꿀 수 있습니다.
// 실제 연장 신청은 매일 새벽 작업(src/lib/server/premiumRenew.ts)이 만료 3일 전에 넣습니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  const [{ data: place }, setting] = await Promise.all([
    db.from("places").select("is_premium, premium_expires_at, premium_plan").eq("id", ctx.placeId).maybeSingle(),
    db.from("premium_auto_renew").select("enabled, plan, months").eq("place_id", ctx.placeId).maybeSingle(),
  ]);
  if (setting.error && !isMissingSchema(setting.error)) return fail(setting.error.message, 500);
  const active = !!place?.is_premium && !!place.premium_expires_at && new Date(place.premium_expires_at).getTime() > Date.now();
  return NextResponse.json({
    ready: !setting.error,
    enabled: setting.data?.enabled ?? null,
    plan: setting.data?.plan ? normalizePlan(setting.data.plan) : null,
    months: setting.data?.months ?? 1,
    expiresAt: active ? place!.premium_expires_at : null,
    currentPlan: active ? normalizePlan(place!.premium_plan) : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ("error" in ctx) return fail(ctx.error, ctx.status);
  if (ctx.isAdmin) return fail("자동 연장은 사장님 본인만 정할 수 있어요.", 403);
  const body = (await req.json().catch(() => null)) as { enabled?: unknown; plan?: unknown; months?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return fail("자동 연장 여부를 골라 주세요.", 400);
  const months = RENEW_MONTH_OPTIONS.includes(Number(body.months)) ? Number(body.months) : 1;
  const plan = body.plan == null ? null : normalizePlan(body.plan);
  const now = new Date().toISOString();
  const { error } = await db.from("premium_auto_renew").upsert(
    { place_id: ctx.placeId, enabled: body.enabled, plan, months, decided_at: now, decided_by: ctx.userId, updated_at: now },
    { onConflict: "place_id" },
  );
  if (error) return isMissingSchema(error) ? fail("자동 연장은 준비 중이에요. 잠시 뒤 다시 해 주세요.", 503) : fail(error.message, 500);
  return NextResponse.json({ ok: true, enabled: body.enabled, plan, months });
}
