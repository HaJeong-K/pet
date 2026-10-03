import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { loadDataQualityReport, runDataQualityCheck } from "@/lib/server/dataQuality";

// 장소 데이터 품질 점검(관리자 전용)
//   GET  → 마지막 점검 결과
//   POST → 지금 바로 점검(사진 확인 때문에 수십 초 걸릴 수 있음)
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  return NextResponse.json({ report: await loadDataQualityReport() });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  try {
    return NextResponse.json({ report: await runDataQualityCheck() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "점검 실패" }, { status: 500 });
  }
}
