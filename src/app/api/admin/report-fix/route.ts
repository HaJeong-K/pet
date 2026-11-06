import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { applyInfoUpdateProposal } from "@/lib/applyInfoUpdateProposal";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";

// 관리자 전용: 장소 신고를 보고 바로 고치기 — 상호 변경·주소·전화·영업시간·분류 등
//   GET  ?placeId=           → 지금 장소 정보(고치기 칸을 채우는 데 씀)
//   POST { reportId, placeId, fields } → 고친 칸만 반영하고 신고를 "조치 완료"로 닫습니다
// 직접 등록한 장소는 그 행을 고치고, 공공데이터 장소는 원본 + 고친 내용으로 실제 행을 만들고 원래 번호를 숨깁니다
// (제보 승인과 같은 방식 — src/lib/applyInfoUpdateProposal.ts). 비운 칸은 건드리지 않습니다.

export const runtime = "nodejs";
export const maxDuration = 60;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FIELDS = ["name", "address", "category", "phone", "hours", "closed_days", "pet_zone", "website", "parking", "entry_fee"] as const;
type Field = (typeof FIELDS)[number];
const MAX = { name: 80, address: 200, category: 40, phone: 30, hours: 500, closed_days: 200, pet_zone: 40, website: 300, parking: 200, entry_fee: 200 } as Record<Field, number>;

async function loadPlace(placeId: number) {
  if (placeId < 1_000_000_000) {
    const { data } = await db.from("places").select("id, name, address, category, phone, hours, closed_days, pet_zone, website, parking, entry_fee").eq("id", placeId).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  return ((await getMergedPublicDataPlaces()) as Record<string, unknown>[]).find((p) => p.id === placeId) ?? null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isFinite(placeId) || placeId <= 0) return NextResponse.json({ error: "placeId required" }, { status: 400 });
  const place = await loadPlace(placeId);
  if (!place) return NextResponse.json({ error: "장소를 찾을 수 없어요. 이미 지워졌을 수 있어요." }, { status: 404 });
  return NextResponse.json({ place: Object.fromEntries(FIELDS.map((f) => [f, (place[f] as string | null) ?? ""])) });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { reportId?: number; placeId?: number; fields?: Record<string, unknown> };
  const placeId = Number(body.placeId), reportId = Number(body.reportId);
  if (!Number.isFinite(placeId) || placeId <= 0) return NextResponse.json({ error: "placeId required" }, { status: 400 });
  const place = await loadPlace(placeId);
  if (!place) return NextResponse.json({ error: "장소를 찾을 수 없어요." }, { status: 404 });

  // 지금 값과 다른 칸만 반영합니다
  const changed: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const v = body.fields?.[f];
    if (typeof v !== "string") continue;
    const next = v.trim().slice(0, MAX[f]);
    if (next && next !== String(place[f] ?? "").trim()) changed[f] = next;
  }
  if (Object.keys(changed).length === 0) return NextResponse.json({ error: "바뀐 내용이 없어요." }, { status: 400 });

  const result = await applyInfoUpdateProposal(db, {
    id: reportId || 0, place_id: placeId, place_name: String(place.name ?? ""), address: String(place.address ?? ""),
    new_name: changed.name, new_address: changed.address, category: changed.category, phone: changed.phone, hours: changed.hours,
    closed_days: changed.closed_days, pet_zone: changed.pet_zone, website: changed.website, parking: changed.parking, entry_fee: changed.entry_fee,
  }, async (id) => (await getMergedPublicDataPlaces()).find((p) => p.id === id) ?? null);
  if (!result.ok) return NextResponse.json({ error: result.reason === "place_not_found" ? "장소를 찾을 수 없어요." : "고치지 못했어요. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });

  // 신고 닫기 — 처리 결과 칸(resolution)이 있으면 "반영"으로 남깁니다(scripts/sql/report-resolution.sql)
  if (Number.isFinite(reportId) && reportId > 0) {
    const { error } = await db.from("reports").update({ is_resolved: true, resolution: "accepted", resolved_at: new Date().toISOString() }).eq("id", reportId);
    if (error) await db.from("reports").update({ is_resolved: true }).eq("id", reportId);
  }
  return NextResponse.json({ ok: true, mode: result.mode, changed: Object.keys(changed) });
}
