import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { listBackups, backupDownloadUrl, runDbBackup } from "@/lib/server/dbBackup";

// 관리자 전용: DB 백업 목록·내려받기·지금 백업
//   GET              → 저장된 백업 목록(최신순)
//   GET ?file=이름   → 그 백업을 내려받을 임시 주소(10분)
//   POST             → 지금 바로 백업 실행
// 백업 파일에는 회원 정보가 들어 있어 비공개 저장소에 두고, 관리자에게만 임시 주소를 내줍니다.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const file = req.nextUrl.searchParams.get("file");
  if (file) {
    const url = await backupDownloadUrl(file);
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "백업 파일을 찾을 수 없어요." }, { status: 404 });
  }
  return NextResponse.json({ backups: await listBackups() });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await runDbBackup() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "백업 실패" }, { status: 500 });
  }
}
