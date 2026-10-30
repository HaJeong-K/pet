// src/lib/server/lodgingIcal.ts
//
// 객실 달력 연동(iCal) — 다른 예약 사이트에서 팔린 날을 같이가개에서 막아 중복 예약을 막습니다.
//   · syncRoomIcal: 그 객실에 넣어 둔 달력 주소를 받아 앞으로 BOOK_AHEAD_DAYS일 안의 막힌 밤을 lodging_ical_blocks에 다시 채움
//   · 매일 새벽 모든 객실을 동기화하고(runLodgingDaily), 손님이 달력을 열 때 5분 넘게 지났으면, 예약 버튼을 누르면 항상 그 객실을 먼저 동기화합니다
//   · 가져온 날이 같이가개 예약과 겹치면 사장님·관리자에게 바로 알립니다(양쪽에서 팔린 경우)
//   · 달력 주소는 https만, 받는 크기 1MB·시간 8초까지
// 표는 scripts/sql/lodging-operations.sql. 규칙(읽기·만들기)은 src/lib/ical.ts.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { cleanIcalUrl, parseIcalNights } from "@/lib/ical";
import { BOOK_AHEAD_DAYS, kstToday, nightsOf, stayDayLabel } from "@/lib/lodgingBooking";
import { sendOwnerPush } from "@/lib/server/ownerPush";
import { notifyAdmin } from "@/lib/server/notify";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000;
/** 손님이 달력을 열 때 이보다 오래됐으면 새로 받습니다 */
export const ICAL_STALE_MS = 5 * 60_000;

async function fetchCalendar(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "gachigagae-calendar-sync" } });
    if (!res.ok) throw new Error(`달력 주소가 응답하지 않아요(${res.status}).`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("달력이 너무 커요.");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("달력(iCal) 주소가 아니에요.");
    return text;
  } finally { clearTimeout(timer); }
}

/** 객실 하나 동기화 — 막은 밤 수를 돌려줍니다 */
export async function syncRoomIcal(roomId: number, importUrl: string | null): Promise<{ blocked: number } | { error: string }> {
  const now = new Date().toISOString();
  if (!importUrl) {
    await db.from("lodging_ical_blocks").delete().eq("room_id", roomId);
    return { blocked: 0 };
  }
  const cleaned = cleanIcalUrl(importUrl);
  if ("error" in cleaned || !cleaned.url) return { error: "error" in cleaned ? cleaned.error : "달력 주소가 없어요." };
  try {
    const text = await fetchCalendar(cleaned.url);
    const today = kstToday();
    const until = new Date(new Date(`${today}T00:00:00Z`).getTime() + (BOOK_AHEAD_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    const nights = parseIcalNights(text, today, until);
    await db.from("lodging_ical_blocks").delete().eq("room_id", roomId);
    if (nights.length) {
      const { error } = await db.from("lodging_ical_blocks").insert(nights.map((n) => ({ room_id: roomId, day: n.day, summary: n.summary, synced_at: now })));
      if (error) throw new Error(error.message);
    }
    await db.from("lodging_rooms").update({ ical_synced_at: now, ical_error: null }).eq("id", roomId);
    if (nights.length) await warnIfDoubleBooked(roomId, nights.map((n) => n.day), today).catch(() => {});
    return { blocked: nights.length };
  } catch (e) {
    const message = e instanceof Error ? (e.name === "AbortError" ? "달력 주소가 너무 늦게 응답해요." : e.message) : "동기화하지 못했어요.";
    await db.from("lodging_rooms").update({ ical_synced_at: now, ical_error: message.slice(0, 200) }).eq("id", roomId);
    return { error: message };
  }
}

/** 다른 사이트에서 팔린 날이 같이가개 예약과 겹치면 사장님·관리자에게 바로 알립니다 */
async function warnIfDoubleBooked(roomId: number, days: string[], today: string): Promise<void> {
  const { data } = await db.from("lodging_bookings").select("id, place_id, room_name, check_in, check_out").eq("room_id", roomId).in("status", ["requested", "confirmed"]).gte("check_out", today);
  const blocked = new Set(days);
  for (const b of data ?? []) {
    if (!nightsOf(b.check_in, b.check_out).some((d) => blocked.has(d))) continue;
    const lines = `${b.room_name} ${stayDayLabel(b.check_in)}~${stayDayLabel(b.check_out)}`;
    await sendOwnerPush(Number(b.place_id), { title: "⚠️ 다른 예약 사이트와 날짜가 겹쳐요", body: `${lines}\n다른 사이트에서도 팔린 날이에요. 어느 예약을 받을지 바로 확인해 주세요.`, tag: `ggk-stay-conflict-${b.id}`, url: "/owner#stays" });
    await notifyAdmin({ title: "⚠️ 숙박 중복 예약 가능성", lines: [`예약 #${b.id} · ${lines}`, "달력 연동에서 같은 날 판매 확인"], path: "/admin/stays" });
  }
}

/**
 * 달력을 새로 받습니다. maxAgeMs보다 최근이면 건너뜁니다. 예약 버튼은 0(항상), 달력을 열 때는 5분.
 * 실패해도 예약은 막지 않고, 이미 받아 둔 막힌 날로 판단합니다.
 */
export async function ensureFreshIcal(roomId: number, maxAgeMs = ICAL_STALE_MS): Promise<void> {
  const { data, error } = await db.from("lodging_rooms").select("ical_import_url, ical_synced_at").eq("id", roomId).maybeSingle();
  if (error || !data?.ical_import_url) return;
  if (data.ical_synced_at && Date.now() - new Date(data.ical_synced_at).getTime() < maxAgeMs) return;
  await syncRoomIcal(roomId, data.ical_import_url);
}

/** 매일 새벽 — 달력 주소가 있는 모든 객실 */
export async function syncAllRoomIcal(): Promise<{ synced: number; failed: number; skipped?: string }> {
  const { data, error } = await db.from("lodging_rooms").select("id, ical_import_url").not("ical_import_url", "is", null).limit(1000);
  if (error) { if (isMissingSchema(error)) return { synced: 0, failed: 0, skipped: "lodging-operations.sql 실행 전" }; throw new Error(error.message); }
  let synced = 0, failed = 0;
  for (const r of data ?? []) {
    const result = await syncRoomIcal(Number(r.id), r.ical_import_url);
    if ("error" in result) failed++; else synced++;
  }
  return { synced, failed };
}

/** 다른 사이트에서 막힌 밤(from 이상 to 미만) — 표가 없으면 빈 목록 */
export async function icalBlockedDays(roomId: number, from: string, to: string): Promise<string[]> {
  const { data, error } = await db.from("lodging_ical_blocks").select("day").eq("room_id", roomId).gte("day", from).lt("day", to);
  if (error) return [];
  return (data ?? []).map((r) => String(r.day));
}
