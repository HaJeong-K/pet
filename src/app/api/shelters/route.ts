import { NextResponse } from "next/server";
import { getShelterDirectory } from "@/lib/server/shelterDirectory";
import { loadSupportOrgs } from "@/lib/server/supportOrgs";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/shelters
// "보호소·후원" 화면에 쓸 자료: 전국 보호소 목록(이름·지역·전화·보호 중인 수 — 주소는 담지 않음)과
// 관리자가 고른 후원 단체 목록(숨김 제외). 30분 동안 CDN이 대신 응답합니다.
export async function GET() {
  const [shelters, orgs] = await Promise.all([getShelterDirectory(), loadSupportOrgs()]);
  return NextResponse.json(
    { shelters, orgs: orgs.filter((org) => !org.hidden).map(({ id, name, description, url }) => ({ id, name, description, url })) },
    // 보호소 목록을 못 받았을 때(빈 목록)는 오래 기억하지 않습니다.
    { headers: { "Cache-Control": shelters.length > 0 ? "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400" : "no-store" } },
  );
}
