import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rebuildPublicDataSnapshot } from "@/lib/publicDataAggregate";
import { syncParks } from "@/lib/server/parksSync";
import { runClosureCheck } from "@/lib/server/closureCheck";
import { runDataQualityCheck } from "@/lib/server/dataQuality";
import { rejectUnauthorizedCron } from "@/lib/server/cronAuth";
import { notifyAdmin } from "@/lib/server/notify";

// GET /api/cron/daily — 매일 자동으로 도는 운영 작업 묶음
// vercel.json의 crons가 매일 UTC 18:00(한국 시간 새벽 3시)에 부릅니다.
//   1) 공공데이터 스냅샷 갱신(관광공사·식약처·문화정보원) — 매일
//   2) 공원 데이터 동기화(전국도시공원정보표준데이터) — 매주 일요일(자주 안 바뀌는 데이터)
//   2-1) 폐업 자동 점검(국세청 영업 상태 조회, 인증된 사장님 업장) — 매주 월요일
//   2-2) 장소 데이터 품질 점검(좌표·중복·깨진 사진·정보 부족) — 매주 화요일, 문제가 있으면 알림
//   3) 오래된 오류 기록 정리 — 매일(90일 지난 것 삭제, DB 용량 관리)
//   4) 아침 요약 알림 — 처리 대기 중인 사장님 신청·제보·신고·프리미엄 신청, 최근 24시간 오류 수
//   + 위 작업 중 하나라도 실패하면 관리자에게 바로 알림(새벽 자동 작업 실패를 아무도 모르는 일 방지)
// 각 작업은 따로 실패해도 나머지는 계속 돌고, 결과를 응답·로그로 남깁니다(Vercel 크론 로그에서 확인).
//
// 보호: src/lib/server/cronAuth.ts(CRON_SECRET). 개발 중에는 주소창에서 직접 열어 테스트할 수 있고,
// ?only=parks 처럼 한 작업만 골라 돌릴 수도 있습니다(public-data | parks | closure | quality | cleanup | digest).

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CLIENT_ERROR_RETENTION_DAYS = 90;

type JobResult = { ok: boolean; ms: number; detail?: unknown; error?: string; skipped?: string };

async function runJob(fn: () => Promise<unknown>): Promise<JobResult> {
  const t = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t, detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

async function cleanupOldErrors(): Promise<{ deleted: number }> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const cutoff = new Date(Date.now() - CLIENT_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin.from("client_errors").delete({ count: "exact" }).lt("created_at", cutoff);
  if (error) throw new Error(error.message);
  return { deleted: count ?? 0 };
}

/** 처리 대기 건수를 모아 한 번에 알립니다. 대기 건이 하나도 없으면 보내지 않습니다. */
async function sendMorningDigest(): Promise<Record<string, number>> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const counts = {
    owners: await count(admin.from("users").select("*", { count: "exact", head: true }).eq("owner_status", "pending")),
    tips: await count(admin.from("proposals").select("*", { count: "exact", head: true }).eq("status", "pending")),
    reports: await count(admin.from("reports").select("*", { count: "exact", head: true }).eq("is_resolved", false)),
    premium: await count(admin.from("premium_requests").select("*", { count: "exact", head: true }).eq("status", "pending")),
    errors24h: await count(admin.from("client_errors").select("*", { count: "exact", head: true }).gte("created_at", since)),
  };
  if (Object.values(counts).some((n) => n > 0)) {
    await notifyAdmin({
      title: "☀️ 같이가개 아침 요약 — 처리 대기",
      lines: [
        counts.owners > 0 && `사장님 신청 ${counts.owners}건 (/admin/owners)`,
        counts.tips > 0 && `제보 ${counts.tips}건 (/admin/tips)`,
        counts.reports > 0 && `신고 ${counts.reports}건 (/admin/reports)`,
        counts.premium > 0 && `프리미엄 신청 ${counts.premium}건 (/admin/premium)`,
        counts.errors24h > 0 && `최근 24시간 오류 ${counts.errors24h}건 (/admin/errors)`,
      ],
      path: "/admin",
    });
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const rejected = rejectUnauthorizedCron(req);
  if (rejected) return rejected;

  const only = req.nextUrl.searchParams.get("only");
  const want = (name: string) => !only || only === name;
  // 한국 시간 기준 일요일에 공원 동기화(크론은 UTC 18시 = 한국 새벽 3시)
  const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
  const results: Record<string, JobResult> = {};

  if (want("public-data")) results.publicData = await runJob(() => rebuildPublicDataSnapshot());
  if (want("parks")) {
    results.parks = only === "parks" || kstDay === 0
      ? await runJob(() => syncParks())
      : { ok: true, ms: 0, skipped: "일요일에만 실행" };
  }
  if (want("closure")) {
    results.closure = only === "closure" || kstDay === 1
      ? await runJob(() => runClosureCheck())
      : { ok: true, ms: 0, skipped: "월요일에만 실행" };
  }
  if (want("quality")) {
    results.quality = only === "quality" || kstDay === 2
      ? await runJob(async () => {
          const report = await runDataQualityCheck();
          if (report.issues.length > 0) {
            const c = report.counts;
            await notifyAdmin({
              title: "🧹 장소 데이터 품질 점검 — 확인 필요",
              lines: [
                c.coords > 0 && `좌표 문제 ${c.coords}곳`,
                c.duplicate > 0 && `중복 의심 ${c.duplicate}곳`,
                c.broken_image > 0 && `깨진 사진 ${c.broken_image}장`,
                c.missing_info > 0 && `정보 부족 ${c.missing_info}곳`,
              ],
              path: "/admin/quality",
            });
          }
          return { places: report.placesChecked, images: report.imagesChecked, ...report.counts };
        })
      : { ok: true, ms: 0, skipped: "화요일에만 실행" };
  }
  if (want("cleanup")) results.cleanup = await runJob(() => cleanupOldErrors());
  if (want("digest")) results.digest = await runJob(() => sendMorningDigest());

  const allOk = Object.values(results).every((r) => r.ok);
  if (!allOk) {
    await notifyAdmin({
      title: "🚨 자동 작업 실패",
      lines: Object.entries(results).filter(([, r]) => !r.ok).map(([name, r]) => `${name}: ${r.error}`),
    });
  }
  console.info("[cron/daily]", JSON.stringify(results));
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 500 });
}
