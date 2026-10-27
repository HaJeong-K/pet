import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { PARK_ID_BASE } from "@/lib/parkPlace";
import { summarizeChecks, type CheckRow } from "@/lib/placeChecks";

// 관리자 전용: 방문자가 "달라졌어요"(동반 불가·폐업·정보 다름)를 남긴 장소 목록 — 데이터 품질 화면에서 씁니다.
// 최근 90일 기준, 경고 상태(달라졌어요가 맞아요보다 많은 곳)를 먼저 보여 줍니다.

const DAY = 86_400_000;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 401 });
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const { data: changed, error } = await db.from("place_checks").select("place_id").eq("verdict", "changed").gte("created_at", since).limit(2000);
  if (error) return isMissingSchema(error) ? NextResponse.json({ ready: false, places: [] }) : NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((changed ?? []).map((r) => Number(r.place_id)))];
  if (ids.length === 0) return NextResponse.json({ ready: true, places: [] });

  const { data: rows } = await db.from("place_checks").select("place_id, verdict, detail, created_at").in("place_id", ids).gte("created_at", since).limit(5000);

  // 장소 이름 — 직접 등록한 장소는 places, 공원은 parks, 나머지는 공공데이터 목록에서
  const names = new Map<number, string>();
  const own = ids.filter((id) => id < 1_000_000_000);
  const parks = ids.filter((id) => id >= PARK_ID_BASE);
  const publicIds = ids.filter((id) => id >= 1_000_000_000 && id < PARK_ID_BASE);
  if (own.length) for (const p of (await db.from("places").select("id, name").in("id", own)).data ?? []) names.set(Number(p.id), p.name);
  if (parks.length) for (const p of (await db.from("parks").select("id, name").in("id", parks.map((id) => id - PARK_ID_BASE))).data ?? []) names.set(Number(p.id) + PARK_ID_BASE, p.name);
  if (publicIds.length) {
    const merged = await getMergedPublicDataPlaces().catch(() => []);
    const wanted = new Set(publicIds);
    for (const p of merged) if (wanted.has(p.id)) names.set(p.id, p.name);
  }

  const places = ids.map((id) => {
    const summary = summarizeChecks(((rows ?? []) as (CheckRow & { place_id: number })[]).filter((r) => Number(r.place_id) === id));
    const lastChangedAt = summary.changed.reduce((latest, c) => (c.lastAt > latest ? c.lastAt : latest), "");
    return { placeId: id, name: names.get(id) ?? `장소 #${id}`, ...summary, lastChangedAt };
  }).sort((a, b) => Number(b.warn) - Number(a.warn) || b.changedCount - a.changedCount || b.lastChangedAt.localeCompare(a.lastChangedAt));

  return NextResponse.json({ ready: true, places });
}
