// src/lib/server/ownerPush.ts
//
// 사장님 기기로 보내는 알림(서버 전용) — 새 예약이 들어오면 휴대폰 상단바에 "멍멍! 새 예약" 알림이 쌓입니다.
//   · 기기 등록: 사장님 센터의 "새 예약 알림" 카드에서 기기마다 한 번 켭니다 → owner_push_subs(scripts/sql/owner-store.sql)
//   · 발송: 유기동물 공고 알림·관리자 알림과 같은 발송 키(VAPID)와 서비스 워커(/sw.js)를 씁니다.
//   · 소리: 안드로이드 앱(mobile/android)에서 켠 기기는 앱의 "새 예약 알림" 전용 알림음(멍멍)으로 울립니다.
//           크롬 같은 브라우저에서 켠 기기는 브라우저가 소리를 정해서, 그 기기의 기본 알림음으로 울립니다.
//           사이트를 열어 둔 상태라면 화면에서도 멍멍 소리를 재생합니다(TabBar.tsx).
// 알림 실패가 예약을 막으면 안 되므로 여기 함수들은 예외를 던지지 않습니다.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { isPushConfigured, sendPush } from "@/lib/server/shelterPush";
import { won } from "@/lib/ownerPlans";
import type { ReservationLine } from "@/lib/storeRules";

/** 가게 한 곳에 등록할 수 있는 기기 수 */
export const OWNER_DEVICES_MAX = 5;
/** 새 예약 알림의 꼬리표 앞머리 — 서비스 워커와 안드로이드 앱이 이것으로 "예약 알림"을 알아봅니다 */
export const ORDER_TAG_PREFIX = "ggk-order";

export type OwnerDevice = { id: string; label: string | null; addedAt: string };
const tail = (endpoint: string) => endpoint.slice(-12);

/** 그 가게에 등록된 기기 목록. ready=false면 표가 아직 없음 */
export async function listOwnerDevices(placeId: number): Promise<{ ready: boolean; devices: OwnerDevice[] }> {
  const { data, error } = await db.from("owner_push_subs").select("endpoint, label, created_at").eq("place_id", placeId).order("created_at", { ascending: false });
  if (error) return { ready: !isMissingSchema(error), devices: [] };
  return { ready: true, devices: (data ?? []).map((d) => ({ id: tail(d.endpoint), label: d.label, addedAt: d.created_at })) };
}

export async function addOwnerDevice(sub: { endpoint: string; p256dh: string; auth: string; userId: string; placeId: number; label: string }): Promise<string | null> {
  const { data: existing } = await db.from("owner_push_subs").select("endpoint").eq("place_id", sub.placeId);
  const others = (existing ?? []).filter((d) => d.endpoint !== sub.endpoint);
  if (others.length >= OWNER_DEVICES_MAX) return `알림을 받을 기기는 ${OWNER_DEVICES_MAX}대까지 등록할 수 있어요. 안 쓰는 기기에서 먼저 꺼 주세요.`;
  const { error } = await db.from("owner_push_subs").upsert(
    [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, auth_user_id: sub.userId, place_id: sub.placeId, label: sub.label }],
    { onConflict: "endpoint" }
  );
  if (error) return isMissingSchema(error) ? "알림 기능을 준비하고 있어요(scripts/sql/owner-store.sql 실행 전)." : error.message;
  return null;
}

export async function removeOwnerDevice(placeId: number, endpoint: string): Promise<void> {
  await db.from("owner_push_subs").delete().eq("place_id", placeId).eq("endpoint", endpoint);
}

/** 그 가게의 기기 모두(또는 한 대)에 알림을 보냅니다. 보낸 기기 수를 돌려줍니다. */
export async function sendOwnerPush(placeId: number, payload: { title: string; body: string; tag: string; url?: string }, onlyEndpoint?: string): Promise<number> {
  try {
    if (!isPushConfigured()) return 0;
    let query = db.from("owner_push_subs").select("endpoint, p256dh, auth").eq("place_id", placeId);
    if (onlyEndpoint) query = query.eq("endpoint", onlyEndpoint);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return 0;
    const results = await Promise.all(data.map((s) => sendPush(s, { title: payload.title, body: payload.body, url: payload.url ?? "/owner#reservations", tag: payload.tag })));
    // 알림을 끄거나 앱을 지운 기기는 목록에서 뺍니다.
    const gone = data.filter((_, i) => results[i] === "gone").map((s) => s.endpoint);
    if (gone.length > 0) await db.from("owner_push_subs").delete().in("endpoint", gone);
    return results.filter((r) => r === "ok").length;
  } catch (e) {
    console.warn("[ownerPush] 전송 실패", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** 새 예약이 들어왔을 때 — 알림마다 꼬리표가 달라서 상단바에 한 건씩 쌓입니다 */
export async function notifyOwnerNewReservation(placeId: number, reservation: { id: number; customer_name: string; items: ReservationLine[]; total: number; pickup_at: string | null }): Promise<number> {
  const first = reservation.items[0];
  const what = first ? `${first.name}${reservation.items.length > 1 ? ` 외 ${reservation.items.length - 1}가지` : ` × ${first.qty}`}` : "예약";
  const pickup = reservation.pickup_at
    ? ` · ${new Date(reservation.pickup_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 수령`
    : "";
  return sendOwnerPush(placeId, {
    title: "멍멍! 새 예약이 들어왔어요",
    body: `${reservation.customer_name}님 · ${what} · ${won(reservation.total)}${pickup}\n눌러서 확정하거나 거절해 주세요.`,
    tag: `${ORDER_TAG_PREFIX}-${reservation.id}`,
  });
}
