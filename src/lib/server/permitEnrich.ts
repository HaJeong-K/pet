// src/lib/server/permitEnrich.ts
//
// 공공데이터 장소의 빈 전화번호·영업 상태를 행정안전부 지방행정 인허가 데이터로 채웁니다(서버 전용, 매일 새벽 /api/cron/daily).
//   · 식약처 음식점·카페·빵집은 전화번호가 아예 없고, 동물병원·약국·미용도 일부 비어 있습니다.
//   · 같은 가게인지는 src/lib/permitMatch.ts가 엄격하게 판단합니다(같은 도로명·건물번호 + 이름이 맞을 때만).
//   · 결과는 public_place_permits 표에 남깁니다. 못 찾은 곳도 줄을 남겨 90일 동안 다시 묻지 않습니다.
//   · 지도 목록을 만들 때(src/lib/publicDataAggregate.ts) 비어 있는 전화번호만 채웁니다 — 원래 값은 바꾸지 않습니다.
//   · 폐업한 지 1년이 넘은 곳은 지도에서 자동으로 빼고, 최근 1년 안에 폐업한 곳만 관리자 신고 목록에 "폐업 의심"으로 올립니다.
// 이용허락: 공공데이터포털 "이용허락범위 제한 없음"(행정안전부_동물·문화·식품 인허가 조회서비스).

import { createClient } from "@supabase/supabase-js";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { districtOf, permitApiKey, PermitQuotaError, queryPermit, roadPart, squash } from "@/lib/server/permitCoords";
import { closedLongAgo, loadPermitRows } from "@/lib/server/permitPhones";
import { PERMIT_PATHS, permitKindsFor, pickPermit, type PermitKind, type PermitMatch, type PermitRecord } from "@/lib/permitMatch";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DAY = 86_400_000;
/** 맞춘 곳·못 찾은 곳 모두 이 기간이 지나면 다시 확인합니다(폐업·전화번호 변경 반영) */
const RECHECK_DAYS = 90;
const CONCURRENCY = 10;
const SYSTEM_REPORTER = "system:permit-check";

export type Target = { id: number; name: string; address: string; category: string; phone: string | null };

/** 한 장소의 인허가 기록을 찾습니다. ① 같은 도로명·건물번호 ② (주소가 도로명이 아니면) 같은 시·군·구의 완전히 같은 이름 */
/**
 * 한 장소를 찾습니다. 오늘 한도를 다 쓴 업종이 끼어 있어 끝까지 보지 못했으면 PermitQuotaError를 던집니다
 * (못 찾았다고 적어 두면 90일 동안 다시 안 보므로, 기록하지 않고 내일 다시 봅니다).
 */
export async function findPermitFor(place: Target, key: string): Promise<(PermitMatch & { kind: PermitKind }) | null> {
  // 폐업 기록만 찾았으면 다른 업종도 마저 봅니다 — 카페가 휴게음식점으로 폐업하고 일반음식점으로 다시 연 경우 등
  let closedMatch: (PermitMatch & { kind: PermitKind }) | null = null;
  let blocked = false;
  for (const kind of permitKindsFor(place.category, place.name)) {
    if (exhausted.has(kind)) { blocked = true; continue; }
    let found: (PermitMatch & { kind: PermitKind }) | null;
    try { found = await findInKind(place, kind, key); }
    catch (e) { if (e instanceof PermitQuotaError) { exhausted.add(kind); blocked = true; continue; } throw e; }
    if (found?.status === "open") return found;
    if (found && !closedMatch) closedMatch = found;
  }
  if (blocked && !closedMatch) throw new PermitQuotaError("오늘 한도를 다 쓴 업종이 있어 내일 다시 확인");
  return closedMatch;
}

/** 오늘 한도를 다 쓴 업종(서버가 켜져 있는 동안 기억 — 날짜가 바뀌면 다시 시도) */
const exhausted = new Set<PermitKind>();
let exhaustedDay = "";
const kstDay = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
function resetExhaustedIfNewDay() { if (exhaustedDay !== kstDay()) { exhausted.clear(); exhaustedDay = kstDay(); } }

async function findInKind(place: Target, kind: PermitKind, key: string): Promise<(PermitMatch & { kind: PermitKind }) | null> {
  const road = roadPart(place.address);
  const district = districtOf(place.address);
  const sameDistrict = (r: PermitRecord) => !district || squash(`${r.ROAD_NM_ADDR ?? ""}${r.LOTNO_ADDR ?? ""}`).includes(squash(district));
  {
    const path = PERMIT_PATHS[kind];
    if (road) {
      const want = squash(`${road.road}${road.number}`);
      const rows = await queryPermit(path, "ROAD_NM_ADDR::LIKE", `${road.road} ${road.number}`, key);
      // "수호로 59"로 찾으면 "수호로 590"도 섞여 나오므로 번호 바로 뒤가 숫자가 아닌 것만
      const same = rows.filter((r) => {
        // 쉼표 뒤(동·호수, 예: "섭골길 51-41, 101호")는 떼고 비교합니다 — 붙이면 "51-41101"이 돼 같은 주소를 놓칩니다
        const addr = squash((r.ROAD_NM_ADDR ?? "").split(",")[0].replace(/\(.*?\)/g, " "));
        const at = addr.indexOf(want);
        return at >= 0 && !/\d/.test(addr[at + want.length] ?? "") && sameDistrict(r);
      });
      const found = pickPermit(place.name, same, 2);
      if (found) return { ...found, kind };
    } else {
      const rows = (await queryPermit(path, "BPLC_NM::LIKE", place.name.replace(/\(.*?\)/g, " ").trim(), key)).filter(sameDistrict);
      const found = pickPermit(place.name, rows, 3);
      if (found) return { ...found, kind };
    }
  }
  return null;
}

/**
 * 매일 새벽: 확인할 차례인 장소를 정해진 시간(maxMs) 안에서 확인합니다.
 * 전화번호가 빈 곳 → 오래전에 확인한 곳 순서. 수동으로 ?only=permits&ms=240000 처럼 길게 돌려 빨리 채울 수 있습니다.
 */
export async function runPermitEnrich(maxMs: number): Promise<{ checked: number; matched: number; phones: number; closed: number; left: number; quotaFull?: string[]; skipped?: string }> {
  const key = permitApiKey();
  if (!key) return { checked: 0, matched: 0, phones: 0, closed: 0, left: 0, skipped: "공공데이터포털 키 없음" };
  const startedAt = Date.now();
  const db = admin();
  resetExhaustedIfNewDay();

  const places = (await getMergedPublicDataPlaces()) as { id: number; name: string; address: string | null; category: string | null; phone: string | null }[];
  const known = await loadPermitRows(db, ["place_id", "checked_at"]);
  const checkedAt = new Map(known.map((r) => [Number(r.place_id), new Date(r.checked_at as string).getTime()]));
  const due = Date.now() - RECHECK_DAYS * DAY;
  const targets: Target[] = places
    .filter((p) => p.name && p.address && permitKindsFor(p.category, p.name).some((k) => !exhausted.has(k)) && (checkedAt.get(p.id) ?? 0) < due)
    .map((p) => ({ id: p.id, name: p.name, address: p.address!, category: p.category ?? "", phone: p.phone || null }))
    .sort((a, b) => Number(!!a.phone) - Number(!!b.phone) || (checkedAt.get(a.id) ?? 0) - (checkedAt.get(b.id) ?? 0));

  let checked = 0, matched = 0, phones = 0, closed = 0, next = 0;
  const worker = async () => {
    while (next < targets.length && Date.now() - startedAt < maxMs) {
      const place = targets[next++];
      // 조회가 잠깐 실패하면(시간 초과 등) 그 장소만 다음 실행으로 미룹니다
      let found: Awaited<ReturnType<typeof findPermitFor>>;
      try { found = await findPermitFor(place, key); } catch { continue; }
      checked++;
      await db.from("public_place_permits").upsert({
        place_id: place.id, matched: !!found, kind: found?.kind ?? null, permit_name: found?.name ?? null,
        phone: found?.phone ?? null, status: found?.status ?? null, closed_on: found?.closedOn ?? null, checked_at: new Date().toISOString(),
      });
      if (!found) continue;
      matched++;
      if (!place.phone && found.phone) phones++;
      if (found.status === "closed") { closed++; await reportClosed(db, place, found); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { checked, matched, phones, closed, left: Math.max(0, targets.length - next), ...(exhausted.size ? { quotaFull: [...exhausted] } : {}) };
}

/** 최근(1년 안) 폐업으로 나온 장소를 관리자 신고 목록에 올립니다(같은 장소에 열린 자동 신고가 있으면 또 만들지 않음) */
async function reportClosed(db: ReturnType<typeof admin>, place: Target, found: PermitMatch) {
  // 폐업한 지 1년이 넘었으면 지도에서 자동으로 빠지므로(src/lib/server/permitPhones.ts) 신고를 만들지 않습니다
  if (closedLongAgo(found.closedOn)) return;
  const { count } = await db.from("reports").select("*", { count: "exact", head: true }).eq("place_id", place.id).eq("reporter_key", SYSTEM_REPORTER).eq("is_resolved", false);
  if (count) return;
  await db.from("reports").insert([{
    type: "place", target_id: String(place.id), place_id: place.id, place_name: place.name, place_address: place.address,
    reporter_key: SYSTEM_REPORTER, nickname: "자동 점검", report_category: "closed",
    report_reason: `행정안전부 인허가 데이터에 '${found.name}'이(가) 폐업${found.closedOn ? `(${found.closedOn})` : ""}으로 나와요. 같은 자리에 새 가게가 열었을 수도 있으니 확인 후 숨김 여부를 정해 주세요.`,
  }]);
}

/**
 * 장소 상세를 열 때 한 곳만 바로 확인합니다(전화번호가 비어 있고 아직 확인하지 않았을 때).
 * 이미 확인한 곳이면 표에 남은 결과를 그대로 돌려줍니다. 맞춘 번호가 없으면 null.
 */
export async function lookupPermitPhone(place: Target): Promise<string | null> {
  const key = permitApiKey();
  const db = admin();
  const { data: row } = await db.from("public_place_permits").select("matched, phone, checked_at").eq("place_id", place.id).maybeSingle();
  if (row && new Date(row.checked_at as string).getTime() > Date.now() - RECHECK_DAYS * DAY) return (row.matched && row.phone) || null;
  if (!key || permitKindsFor(place.category, place.name).length === 0) return null;
  resetExhaustedIfNewDay();
  let found: Awaited<ReturnType<typeof findPermitFor>>;
  try { found = await findPermitFor(place, key); } catch { return null; }
  await db.from("public_place_permits").upsert({
    place_id: place.id, matched: !!found, kind: found?.kind ?? null, permit_name: found?.name ?? null,
    phone: found?.phone ?? null, status: found?.status ?? null, closed_on: found?.closedOn ?? null, checked_at: new Date().toISOString(),
  });
  if (found?.status === "closed") await reportClosed(db, place, found);
  return found?.phone ?? null;
}
