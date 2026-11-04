// src/lib/server/checkRequests.ts
//
// 오래된 정보 확인 요청 — 사람(방문자·사장님)이 90일 넘게 확인하지 않은 장소를, 그 장소와 인연이 있는 회원에게 묻습니다.
// 공공데이터는 갱신이 느려서, 실제로 가 본 사람의 확인으로 최신성을 채우려는 장치입니다. 매주 목요일 새벽(/api/cron/daily).
//
// 묻는 규칙(2026-11-03 대표 결정)
//   · 한 사람에게는 한 달(30일)에 한 번까지만 묻습니다 — 자주 오는 알림은 꺼 버리게 됩니다.
//   · 한 장소는 한 주에 한 명에게만 묻습니다. 그 장소를 찜한 회원 중 아직 안 물어본 사람을 무작위로 고르고,
//     물어본 사람은 명단에서 빠집니다. 답이 없거나 "잘 모르겠어요"면 다음 주에 다른 사람에게 갑니다.
//     누군가 "맞아요/달라졌어요"로 답하면 그 장소는 최신이 되어 질문이 멈춥니다.
//   · 찜한 회원을 모두 물어봤거나 찜한 사람이 없으면 → 최근 90일 안에 그 장소를 열어 본 회원에게 묻습니다.
//   · 그래도 물어볼 사람이 없으면 → 인증된 사장님이 있는 장소는 사장님께 확인을 요청하고(한 달에 한 번),
//     사장님도 없으면 "물어볼 사람이 없는 장소" 수로 결과에 남깁니다(새벽 알림·관리자 확인용).
//   · 한 번 물어본 사람도 180일이 지나면 다시 명단에 들어옵니다. 위치 정보는 쓰지 않습니다.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { notifyGuest } from "@/lib/server/guestNotify";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";

const DAY = 86_400_000;
const FRESH_DAYS = 90;
const USER_GAP_DAYS = 30;
const ASK_AGAIN_DAYS = 180;
const VIEW_DAYS = 90;
const MAX_PER_RUN = 300;
const KIND = "check_request";
const OWNER_KIND = "owner_check_request";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const checkRequestUrl = (placeId: number) => `/place/${placeId}?check=1`;

const shuffle = <T,>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export async function runCheckRequests(now = Date.now()): Promise<{ asked: number; owners: number; noCandidates: number; stale: number; skipped?: string }> {
  const iso = (days: number) => new Date(now - days * DAY).toISOString();

  // 1) 장소와 인연이 있는 회원: 찜한 사람(먼저) · 최근에 열어 본 사람
  const { data: marks, error } = await db.from("reactions").select("place_id, user_key").eq("type", "bookmark").limit(10000);
  if (error) throw new Error(error.message);
  const { data: views } = await db.from("analytics_events").select("place_id, auth_user_id").eq("event_type", "place_view").not("auth_user_id", "is", null).gte("created_at", iso(VIEW_DAYS)).limit(20000);
  const bookmarkers = new Map<number, Set<string>>();
  const viewers = new Map<number, Set<string>>();
  const add = (m: Map<number, Set<string>>, place: unknown, user: unknown) => {
    const id = Number(place); const u = String(user ?? "");
    if (!Number.isFinite(id) || id <= 0 || !UUID.test(u)) return;
    if (!m.has(id)) m.set(id, new Set());
    m.get(id)!.add(u);
  };
  for (const r of marks ?? []) add(bookmarkers, r.place_id, r.user_key);
  for (const r of views ?? []) add(viewers, r.place_id, r.auth_user_id);
  const placeIds = [...new Set([...bookmarkers.keys(), ...viewers.keys()])];
  if (placeIds.length === 0) return { asked: 0, owners: 0, noCandidates: 0, stale: 0 };

  // 2) 사람이 최근에 확인한 장소는 뺍니다
  const { data: checks, error: checkError } = await db.from("place_checks").select("place_id").eq("verdict", "ok").gte("created_at", iso(FRESH_DAYS)).in("place_id", placeIds);
  if (checkError && isMissingSchema(checkError)) return { asked: 0, owners: 0, noCandidates: 0, stale: 0, skipped: "place-verification.sql 실행 전" };
  const fresh = new Set((checks ?? []).map((c) => Number(c.place_id)));
  const ownPlaces = placeIds.filter((id) => id < 1_000_000_000);
  const names = new Map<number, string>();
  if (ownPlaces.length) {
    const { data } = await db.from("places").select("id, name, owner_verified_at").in("id", ownPlaces);
    for (const p of data ?? []) {
      names.set(Number(p.id), p.name);
      if (p.owner_verified_at && p.owner_verified_at >= iso(FRESH_DAYS)) fresh.add(Number(p.id));
    }
  }
  if (placeIds.some((id) => id >= 1_000_000_000)) {
    const wanted = new Set(placeIds);
    for (const p of await getMergedPublicDataPlaces().catch(() => [])) if (wanted.has(p.id)) names.set(p.id, p.name);
  }
  const stale = shuffle(placeIds.filter((id) => !fresh.has(id) && names.has(id)));

  // 3) 이미 보낸 기록 — 사람별 마지막 요청, 장소별로 물어본 사람
  const { data: sent } = await db.from("user_notifications").select("auth_user_id, kind, url, created_at").in("kind", [KIND, OWNER_KIND]).gte("created_at", iso(ASK_AGAIN_DAYS)).limit(20000);
  const recentUser = new Set((sent ?? []).filter((s) => s.created_at >= iso(USER_GAP_DAYS)).map((s) => s.auth_user_id));
  const askedFor = new Map<string, Set<string>>();
  for (const s of sent ?? []) { if (!askedFor.has(s.url)) askedFor.set(s.url, new Set()); askedFor.get(s.url)!.add(s.auth_user_id); }

  let asked = 0, owners = 0, noCandidates = 0;
  for (const placeId of stale) {
    if (asked + owners >= MAX_PER_RUN) break;
    const url = checkRequestUrl(placeId);
    const already = askedFor.get(url) ?? new Set<string>();
    const pick = (pool: Set<string> | undefined) => shuffle([...(pool ?? [])]).find((u) => !already.has(u) && !recentUser.has(u));
    const user = pick(bookmarkers.get(placeId)) ?? pick(viewers.get(placeId));
    if (user) {
      await notifyGuest(user, {
        kind: KIND,
        title: bookmarkers.get(placeId)?.has(user) ? "찜한 장소, 아직 그대로인가요?" : "최근에 본 장소, 아직 그대로인가요?",
        body: `${names.get(placeId)} 정보를 사람이 확인한 지 오래됐어요. 다녀오셨다면 '맞아요'나 '달라졌어요'를 눌러 주세요.`,
        url,
      });
      recentUser.add(user);
      asked++;
      continue;
    }
    // 물어볼 회원이 없으면 사장님께(직접 등록 장소만, 한 달에 한 번)
    if (placeId < 1_000_000_000) {
      const { data: owner } = await db.from("users").select("auth_user_id").eq("owner_status", "verified").eq("owner_place_id", placeId).limit(1).maybeSingle();
      const ownerId = owner?.auth_user_id as string | undefined;
      if (ownerId && !recentUser.has(ownerId)) {
        await notifyGuest(ownerId, {
          kind: OWNER_KIND,
          title: "가게 정보가 지금도 맞는지 확인해 주세요",
          body: `${names.get(placeId)} 정보를 확인한 지 90일이 넘었어요. 사장님 센터에서 '지금 정보가 맞아요'를 눌러 주시면 손님에게 '사장님 확인'으로 보여요.`,
          url: "/owner",
        });
        recentUser.add(ownerId);
        owners++;
        continue;
      }
    }
    noCandidates++;
  }
  return { asked, owners, noCandidates, stale: stale.length };
}
