import { NextRequest, NextResponse } from "next/server";
import { rebuildPublicDataSnapshot } from "@/lib/publicDataAggregate";
import { rejectUnauthorizedCron } from "@/lib/server/cronAuth";

// GET /api/cron/sync-public-data
// 공공데이터(관광공사·식약처·문화정보원) 전체 목록을 하루 한 번 새로 만들어 Supabase Storage
// 스냅샷으로 저장합니다(src/lib/publicDataAggregate.ts 참고). 매일 자동 실행은 /api/cron/daily가
// 맡고, 이 주소는 데이터를 바로 새로 받고 싶을 때 수동으로 부르는 용도입니다.
// 보호: src/lib/server/cronAuth.ts(CRON_SECRET)

// 관광공사 목록 여러 페이지 + 상세를 받느라 수십 초 걸릴 수 있어 넉넉히 줍니다.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rejected = rejectUnauthorizedCron(req);
  if (rejected) return rejected;

  const startedAt = Date.now();
  try {
    const result = await rebuildPublicDataSnapshot();
    const ms = Date.now() - startedAt;
    console.info(`[cron/sync-public-data] ${result.count}곳, 저장 ${result.saved ? "성공" : "실패"}, ${ms}ms`);
    return NextResponse.json({ ...result, ms }, { status: result.saved ? 200 : 500 });
  } catch (e) {
    console.error("[cron/sync-public-data] 실패:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
