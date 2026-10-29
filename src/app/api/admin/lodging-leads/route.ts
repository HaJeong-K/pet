import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { isLodgingCategory } from "@/lib/ownerKind";

// 관리자 "숙박 예약 → 입점 영업" — 아직 입점하지 않은 반려동물 동반 숙소(공공데이터 + 직접 등록) 중 전화번호가 있는 곳을
// 영업 리스트로 보여 주고, 연락 상태·메모를 남깁니다(scripts/sql/lodging-operations.sql — lodging_leads).
//   GET  → 숙소 목록(이름·분류·주소·전화) + 연락 상태·메모·마지막 연락일, 입점 신청·승인된 곳은 따로 표시
//   POST { placeId, status, memo } → 연락 상태·메모 저장(status: todo | contacted | interested | declined | joined)

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const LEAD_STATUS = ["todo", "contacted", "interested", "declined", "joined"] as const;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("관리자 권한 없음", 401);
  const [publicPlaces, own, leads, partners] = await Promise.all([
    getMergedPublicDataPlaces().catch(() => [] as Record<string, unknown>[]),
    db.from("places").select("id, name, category, address, phone").limit(5000),
    db.from("lodging_leads").select("place_id, status, memo, contacted_at, updated_at"),
    db.from("lodging_partners").select("requested_place_id, linked_place_id, status"),
  ]);
  const seen = new Set<number>();
  const items: { id: number; name: string; category: string | null; address: string | null; phone: string }[] = [];
  for (const p of [...(own.data ?? []), ...(publicPlaces as Record<string, any>[])]) {
    const id = Number(p.id);
    if (!Number.isFinite(id) || seen.has(id) || !isLodgingCategory(p.category) || !p.phone) continue;
    seen.add(id);
    items.push({ id, name: String(p.name), category: p.category ?? null, address: p.address ?? null, phone: String(p.phone) });
  }
  const leadOf = new Map((leads.data ?? []).map((l) => [Number(l.place_id), l]));
  const partnerOf = new Map<number, string>();
  for (const p of partners.data ?? []) {
    if (p.requested_place_id != null) partnerOf.set(Number(p.requested_place_id), p.status);
    if (p.linked_place_id != null) partnerOf.set(Number(p.linked_place_id), p.status);
  }
  return NextResponse.json({
    ready: !leads.error,
    leads: items.map((it) => ({ ...it, lead: leadOf.get(it.id) ?? null, partnerStatus: partnerOf.get(it.id) ?? null }))
      .sort((a, b) => (a.address ?? "").localeCompare(b.address ?? "", "ko")),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("관리자 권한 없음", 401);
  const body = (await req.json().catch(() => null)) as { placeId?: unknown; status?: unknown; memo?: unknown } | null;
  const placeId = Number(body?.placeId);
  if (!Number.isInteger(placeId) || placeId <= 0) return fail("숙소를 찾을 수 없어요.", 400);
  const status = LEAD_STATUS.find((s) => s === body?.status);
  if (!status) return fail("연락 상태를 골라 주세요.", 400);
  const memo = typeof body?.memo === "string" && body.memo.trim() ? body.memo.trim().slice(0, 1000) : null;
  const now = new Date().toISOString();
  const { error } = await db.from("lodging_leads").upsert(
    { place_id: placeId, status, memo, updated_at: now, updated_by: admin.email || admin.id, ...(status !== "todo" ? { contacted_at: now } : {}) },
    { onConflict: "place_id" },
  );
  if (error) return isMissingSchema(error) ? fail("영업 리스트는 준비 중이에요(lodging-operations.sql 실행 필요).", 503) : fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
