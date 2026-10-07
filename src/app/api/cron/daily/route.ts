import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rebuildPublicDataSnapshot } from "@/lib/publicDataAggregate";
import { enrichTourDetails } from "@/lib/server/tourDetails";
import { runDbBackup } from "@/lib/server/dbBackup";
import { fetchTourTargets } from "@/app/api/public-data/tour/route";
import { syncParks } from "@/lib/server/parksSync";
import { runClosureCheck } from "@/lib/server/closureCheck";
import { runDataQualityCheck } from "@/lib/server/dataQuality";
import { runShelterPush } from "@/lib/server/shelterPush";
import { rejectUnauthorizedCron } from "@/lib/server/cronAuth";
import { notifyAdmin } from "@/lib/server/notify";
import { syncCultureFile, syncFoodFile } from "@/lib/server/fileDataSync";
import { cleanupShelterThumbs } from "@/lib/server/shelterThumbs";

// GET /api/cron/daily — 매일 자동으로 도는 운영 작업 묶음
// vercel.json의 crons가 매일 UTC 18:00(한국 시간 새벽 3시)에 부릅니다.
//   1) 공공데이터 스냅샷 갱신(관광공사·식약처·문화정보원) — 매일
//   2) 공원 데이터 동기화(전국도시공원정보표준데이터) — 매주 일요일(자주 안 바뀌는 데이터)
//   2-1) 폐업 자동 점검(국세청 영업 상태 조회, 인증된 사장님 업장) — 매주 월요일
//   2-2) 장소 데이터 품질 점검(좌표·중복·깨진 사진·정보 부족) — 매주 화요일, 문제가 있으면 알림
//   2-3) 유기동물 공고 지역 알림 — 매일(구독자가 있는 지역의 새 공고를 브라우저 알림으로 발송)
//   3) 오래된 오류 기록 정리 — 매일(90일 지난 것 삭제, DB 용량 관리)
//   4) 아침 요약 알림 — 처리 대기 중인 사장님 신청·제보·신고·프리미엄 신청, 최근 24시간 오류 수
//   + 위 작업 중 하나라도 실패하면 관리자에게 바로 알림(새벽 자동 작업 실패를 아무도 모르는 일 방지)
// 각 작업은 따로 실패해도 나머지는 계속 돌고, 결과를 응답·로그로 남깁니다(Vercel 크론 로그에서 확인).
//
// 보호: src/lib/server/cronAuth.ts(CRON_SECRET). 개발 중에는 주소창에서 직접 열어 테스트할 수 있고,
// ?only=parks 처럼 한 작업만 골라 돌릴 수도 있습니다(backup | parks | closure | quality | food-file | culture-file | shelter-push | cleanup | digest | tour-details | public-data — 실행 순서대로).
// tour-details는 ?ms=240000 처럼 받을 시간을 늘려 수동으로 여러 번 돌려 빨리 채울 수도 있습니다.

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CLIENT_ERROR_RETENTION_DAYS = 90;
/** 이 함수가 쓸 수 있는 전체 시간(maxDuration과 같음) */
const FUNCTION_LIMIT_MS = 300_000;
/** 관광공사 상세 수집 뒤에 남겨 둘 시간 — 목록 갱신(약 10초)·실패 알림·응답 */
const TAIL_RESERVE_MS = 35_000;
/** 매일 새벽 관광공사 상세를 받는 데 쓰는 시간의 상한(하루 한도 약 1,000곳 ≈ 3분) / 이보다 적게 남으면 건너뜀 / 수동 실행 시 상한 */
const TOUR_DETAILS_MS = 210_000;
const TOUR_DETAILS_MIN_MS = 20_000;
const TOUR_DETAILS_MAX_MS_LIMIT = 270_000;

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

// 처리 대기 건수 — 알림은 맨 마지막 "새벽 자동 작업 결과" 한 통에 함께 담습니다.
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
    // 자동 검토에 걸려 확인을 기다리는 커뮤니티 글(컬럼이 아직 없으면 0)
    postReview: await count(admin.from("community_posts").select("*", { count: "exact", head: true }).eq("review_status", "pending").eq("deleted", false)),
  };
  return counts;
}

export async function GET(req: NextRequest) {
  const rejected = rejectUnauthorizedCron(req);
  if (rejected) return rejected;

  const only = req.nextUrl.searchParams.get("only");
  const want = (name: string) => !only || only === name;
  // 한국 시간 기준 일요일에 공원 동기화(크론은 UTC 18시 = 한국 새벽 3시)
  const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate();
  const results: Record<string, JobResult> = {};
  const startedAt = Date.now();

  // DB 백업 — 다른 작업이 데이터를 바꾸기 전에 가장 먼저 합니다.
  if (want("backup")) results.backup = await runJob(() => runDbBackup());

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
  // 파일로만 제공되는 공공데이터(실시간 API 없음) 자동 갱신 — src/lib/server/fileDataSync.ts
  //   식품안전나라 음식점: 매주 수요일(최신 목록을 받아 새 곳 추가·빠진 곳 삭제)
  //   문화정보원 문화시설: 매달 1일(파일이 바뀌었는지 확인하고, 바뀌었을 때만 다시 넣음)
  if (want("food-file")) {
    results.foodFile = only === "food-file" || kstDay === 3
      ? await runJob(() => syncFoodFile())
      : { ok: true, ms: 0, skipped: "수요일에만 실행" };
  }
  if (want("culture-file")) {
    results.cultureFile = only === "culture-file" || kstDate === 1
      ? await runJob(() => syncCultureFile(req.nextUrl.searchParams.get("force") === "1"))
      : { ok: true, ms: 0, skipped: "매달 1일에만 실행" };
  }
  if (want("shelter-push")) results.shelterPush = await runJob(() => runShelterPush());
  // 오래된 오류 기록과, 줄여 둔 공고 사진 가운데 30일 지난 것을 지웁니다.
  if (want("cleanup")) results.cleanup = await runJob(async () => ({ ...(await cleanupOldErrors()), thumbs: await cleanupShelterThumbs() }));
  if (want("digest")) results.digest = await runJob(() => sendMorningDigest());

  // 관광공사 장소 상세(영업시간·전화·반려동물 동반 조건)를 아직 못 받은 곳부터 이어서 받습니다.
  // 하루 한도(약 1,000곳)를 다 쓰려면 3분쯤 걸려서, 다른 작업을 모두 끝낸 뒤 "남은 시간"을 여기에 씁니다
  // (요일마다 도는 작업이 달라 남는 시간이 다릅니다). 목록 갱신(public-data)은 그 뒤에 돌려서
  // 오늘 받은 상세가 바로 오늘 스냅샷에 들어가게 합니다.
  if (want("tour-details")) {
    const requested = Number(req.nextUrl.searchParams.get("ms"));
    const remaining = FUNCTION_LIMIT_MS - (Date.now() - startedAt) - TAIL_RESERVE_MS;
    const maxMs = requested > 0 ? Math.min(TOUR_DETAILS_MAX_MS_LIMIT, requested) : Math.min(TOUR_DETAILS_MS, remaining);
    results.tourDetails = maxMs >= TOUR_DETAILS_MIN_MS
      ? await runJob(async () => enrichTourDetails(await fetchTourTargets(), maxMs))
      : { ok: true, ms: 0, skipped: "남은 시간이 부족해 다음 실행으로 미룸" };
  }
  if (want("public-data")) results.publicData = await runJob(() => rebuildPublicDataSnapshot());

  const allOk = Object.values(results).every((r) => r.ok);
  // 결과 보고 — 매일 한 통. 예전엔 실패했거나 처리할 것이 있을 때만 보내서, 조용한 날에는
  // 작업이 돌았는지조차 알 수 없었습니다. (한 작업만 골라 돌린 수동 실행은 실패했을 때만 알립니다.)
  if (!only || !allOk) {
    const failed = Object.entries(results).filter(([, r]) => !r.ok);
    const backup = results.backup?.detail as { rows?: number; sizeKb?: number } | undefined;
    const tour = results.tourDetails?.detail as { fetched?: number; have?: number; total?: number } | undefined;
    const c = (results.digest?.detail ?? {}) as Record<string, number>;
    const food = results.foodFile?.ok ? (results.foodFile.detail as { added?: number; removed?: number; pending?: number } | undefined) : undefined;
    const culture = results.cultureFile?.ok ? (results.cultureFile.detail as { changed?: boolean; added?: number; removed?: number } | undefined) : undefined;
    const pending = [
      c.owners > 0 && `사장님 신청 ${c.owners}`, c.tips > 0 && `제보 ${c.tips}`, c.reports > 0 && `신고 ${c.reports}`,
      c.postReview > 0 && `글 검토 ${c.postReview}`, c.premium > 0 && `프리미엄 ${c.premium}`,
    ].filter(Boolean);
    await notifyAdmin({
      title: allOk ? "🌙 새벽 자동 작업 완료" : "🚨 새벽 자동 작업 — 일부 실패",
      lines: [
        ...failed.map(([name, r]) => `실패 ${name}: ${String(r.error).slice(0, 40)}`),
        results.backup?.ok && `DB 백업 완료${backup?.sizeKb ? ` (${backup.sizeKb}KB)` : ""}`,
        results.tourDetails?.ok && tour && `장소 상세 +${tour.fetched ?? 0}곳 (${tour.have ?? 0}/${tour.total ?? 0})`,
        results.publicData?.ok && "지도 장소 목록 갱신",
        food && `음식점 목록 갱신: +${food.added ?? 0} / -${food.removed ?? 0}${food.pending ? ` (좌표 대기 ${food.pending})` : ""}`,
        culture?.changed && `문화시설 새 파일 반영: +${culture.added ?? 0} / -${culture.removed ?? 0}`,
        !only && (pending.length > 0 ? `처리 대기: ${pending.join(", ")}` : "처리 대기 없음"),
        c.errors24h > 0 && `최근 24시간 오류 ${c.errors24h}건`,
      ],
      path: "/admin",
    });
  }
  console.info("[cron/daily]", JSON.stringify(results));
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 500 });
}
