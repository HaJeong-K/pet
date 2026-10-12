import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { loadSupportOrgs, sanitizeOrgs, saveSupportOrgs } from "@/lib/server/supportOrgs";

// 후원 단체 목록 관리(관리자 전용)
//   GET → 전체 목록(숨김 포함)
//   PUT → 목록 통째로 저장({ orgs: [...] })
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  return NextResponse.json({ orgs: await loadSupportOrgs() });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const result = sanitizeOrgs(body?.orgs);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    await saveSupportOrgs(result.orgs);
    return NextResponse.json({ orgs: result.orgs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장하지 못했어요." }, { status: 500 });
  }
}
