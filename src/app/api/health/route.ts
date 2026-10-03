import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/health — 서비스 상태 점검(가동 감시용)
// UptimeRobot 같은 무료 감시 서비스에 이 주소를 등록하면, 몇 분마다 확인하다가 응답이 200이 아니면
// 알림을 보내줍니다. 누구나 부를 수 있는 공개 주소라 키·내부 오류 메시지 같은 정보는 내보내지 않고
// 항목별 정상 여부만 알려줍니다.
//   db        : DB에 접속해 간단한 조회가 되는지
//   publicData: 공공데이터 스냅샷이 최근(48시간 안)에 갱신됐는지 — 새벽 자동 작업이 멈췄는지 확인
//   config    : 필수 서버 설정(환경변수)이 다 들어가 있는지(값은 내보내지 않음)
// 하나라도 실패하면 503을 돌려줍니다.

export const dynamic = "force-dynamic";

const SNAPSHOT_MAX_AGE_HOURS = 48;
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_KAKAO_MAP_KEY", "KAKAO_REST_API_KEY", "TOUR_API_KEY", "CRON_SECRET",
];

type Check = { ok: boolean; ms?: number; note?: string };

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, Check> = {};

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  // 개발 환경에서는 CRON_SECRET이 없어도 됩니다(크론은 배포 환경에서만 돔).
  const missingRequired = process.env.NODE_ENV === "production" ? missing : missing.filter((k) => k !== "CRON_SECRET");
  checks.config = missingRequired.length === 0 ? { ok: true } : { ok: false, note: `필수 설정 ${missingRequired.length}개 없음` };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false } });

    const t = Date.now();
    const { error } = await admin.from("places").select("id", { count: "exact", head: true });
    checks.db = error ? { ok: false, ms: Date.now() - t, note: "조회 실패" } : { ok: true, ms: Date.now() - t };

    const { data: files, error: listError } = await admin.storage.from("public-data-cache").list();
    const snap = files?.find((f) => f.name === "merged-v1.json.gz");
    const updated = snap?.updated_at || snap?.created_at;
    const ageHours = updated ? (Date.now() - new Date(updated).getTime()) / 3_600_000 : null;
    checks.publicData =
      listError || ageHours == null
        ? { ok: false, note: "스냅샷 없음" }
        : ageHours <= SNAPSHOT_MAX_AGE_HOURS
          ? { ok: true, note: `${Math.round(ageHours)}시간 전 갱신` }
          : { ok: false, note: `${Math.round(ageHours)}시간째 갱신 안 됨` };
  } else {
    checks.db = { ok: false, note: "DB 설정 없음" };
    checks.publicData = { ok: false, note: "DB 설정 없음" };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, checks, ms: Date.now() - startedAt, at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
