// src/lib/server/guestNotify.ts
//
// 손님 알림 — 마이페이지 "알림"(user_notifications)에 남기고, 그 손님이 알림을 켜 둔 기기(push_subscriptions)로도 보냅니다.
//   · 숙박 예약 확정·거절·숙소 사정 취소·자동 취소, 체크인 전날 안내, 체크아웃 후 후기 요청
// 알림함 표가 아직 없으면(scripts/sql/lodging-operations.sql 실행 전) 기기 알림만 보냅니다. 실패해도 예약 처리는 막지 않습니다.

import { db, isMissingSchema } from "@/lib/server/ownerStore";
import { sendPush } from "@/lib/server/shelterPush";
import { stayDayLabel } from "@/lib/lodgingBooking";

export type GuestNotice = { kind: string; title: string; body: string; url: string };

export async function notifyGuest(authUserId: string, n: GuestNotice): Promise<void> {
  try {
    const { error } = await db.from("user_notifications").insert({ auth_user_id: authUserId, kind: n.kind, title: n.title, body: n.body, url: n.url });
    if (error && !isMissingSchema(error)) console.error("[guestNotify] save failed:", error.message);
    const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("auth_user_id", authUserId).limit(10);
    const gone: string[] = [];
    for (const sub of subs ?? []) {
      const r = await sendPush(sub, { title: n.title, body: n.body, url: n.url, tag: `ggk-${n.kind}-${Date.now()}` });
      if (r === "gone") gone.push(sub.endpoint);
    }
    if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
  } catch (e) {
    console.error("[guestNotify] failed:", e);
  }
}

type StayEvent = "confirmed" | "declined" | "cancelled_by_owner" | "expired" | "reminder" | "review";

/** 숙박 예약 한 건에 대한 손님 알림 */
export async function notifyStayGuest(bookingId: number, event: StayEvent): Promise<void> {
  const { data: b } = await db.from("lodging_bookings").select("id, place_id, room_name, check_in, check_out, guest_auth_user_id").eq("id", bookingId).maybeSingle();
  if (!b?.guest_auth_user_id) return;
  const { data: place } = await db.from("places").select("name").eq("id", b.place_id).maybeSingle();
  const name = place?.name ?? "숙소";
  const when = `${stayDayLabel(b.check_in)} ~ ${stayDayLabel(b.check_out)}`;
  const my = "/mypage#stays";
  const map: Record<StayEvent, GuestNotice> = {
    confirmed: { kind: "stay_confirmed", title: "숙박 예약이 확정됐어요", body: `${name} · ${b.room_name} · ${when}`, url: my },
    declined: { kind: "stay_declined", title: "숙소가 예약을 받지 못했어요", body: `${name} · ${when} 예약은 전액 환불돼요.`, url: my },
    cancelled_by_owner: { kind: "stay_cancelled", title: "숙소 사정으로 예약이 취소됐어요", body: `${name} · ${when} — 전액 환불과 배상금을 안내해 드려요.`, url: my },
    expired: { kind: "stay_declined", title: "숙소가 24시간 안에 확정하지 않았어요", body: `${name} · ${when} 예약은 자동 취소되고 전액 환불돼요.`, url: my },
    reminder: { kind: "stay_reminder", title: "내일 체크인이에요", body: `${name} · ${b.room_name} · 반려동물 동반 조건과 체크인 시각을 한 번 더 확인해 주세요.`, url: my },
    review: { kind: "stay_review", title: "숙소는 어떠셨나요?", body: `${name}에 숙박 후기를 남겨 주세요. 다음 손님에게 큰 도움이 돼요.`, url: `/stay/${b.place_id}#stay-reviews` },
  };
  await notifyGuest(b.guest_auth_user_id, map[event]);
}

/**
 * 매일 새벽: 내일 체크인하는 확정 예약에 "내일 체크인" 안내, 오늘(또는 그 전) 체크아웃한 확정·완료 예약에 후기 요청 — 각각 한 번만.
 */
export async function runGuestStayNotices(today: string): Promise<{ reminded: number; reviewAsked: number; skipped?: string }> {
  const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const { data: soon, error } = await db.from("lodging_bookings").select("id").eq("status", "confirmed").eq("check_in", tomorrow).is("guest_reminded_at", null).limit(500);
  if (error) { if (isMissingSchema(error)) return { reminded: 0, reviewAsked: 0, skipped: "lodging-operations.sql 실행 전" }; throw new Error(error.message); }
  let reminded = 0;
  for (const b of soon ?? []) {
    await notifyStayGuest(b.id, "reminder");
    await db.from("lodging_bookings").update({ guest_reminded_at: new Date().toISOString() }).eq("id", b.id);
    reminded++;
  }
  const { data: done } = await db.from("lodging_bookings").select("id").in("status", ["confirmed", "completed"]).lte("check_out", today).is("review_requested_at", null)
    .gte("check_out", new Date(new Date(`${today}T00:00:00Z`).getTime() - 14 * 86_400_000).toISOString().slice(0, 10)).limit(500);
  let reviewAsked = 0;
  for (const b of done ?? []) {
    await notifyStayGuest(b.id, "review");
    await db.from("lodging_bookings").update({ review_requested_at: new Date().toISOString() }).eq("id", b.id);
    reviewAsked++;
  }
  return { reminded, reviewAsked };
}
