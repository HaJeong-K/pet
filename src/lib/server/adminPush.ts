// src/lib/server/adminPush.ts
//
// 관리자 폰(브라우저) 알림 — 서버 전용. 카카오톡 '나와의 채팅'은 내가 나에게 보낸 메시지라 알림음이 울리지 않아서,
// 같은 관리자 알림을 브라우저 알림(푸시)으로도 보냅니다. 관리자 대시보드의 "폰 알림" 카드에서 기기마다 켭니다.
//
// 보관: 비공개 저장소(app-private)의 파일 하나 — 관리자 기기는 몇 대뿐이라 DB 표를 새로 만들지 않았습니다.
// 발송 방식(VAPID 키, 서비스 워커 /sw.js)은 유기동물 공고 알림(src/lib/server/shelterPush.ts)과 같습니다.

import { createClient } from "@supabase/supabase-js";
import { isPushConfigured, sendPush } from "@/lib/server/shelterPush";

const BUCKET = "app-private";
const FILE = "admin-push-subs.json";
/** 등록할 수 있는 관리자 기기 수 */
const MAX_DEVICES = 10;

export type AdminPushSub = { endpoint: string; p256dh: string; auth: string; adminId: string; label: string; addedAt: number };

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function load(): Promise<AdminPushSub[]> {
  const { data, error } = await admin().storage.from(BUCKET).download(FILE);
  if (error || !data) return [];
  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function save(subs: AdminPushSub[]): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await client.storage.from(BUCKET).upload(FILE, Buffer.from(JSON.stringify(subs)), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`기기 저장 실패: ${error.message}`);
}

export async function listAdminPushSubs(): Promise<AdminPushSub[]> {
  return load();
}

export async function addAdminPushSub(sub: Omit<AdminPushSub, "addedAt">): Promise<void> {
  const rest = (await load()).filter((s) => s.endpoint !== sub.endpoint);
  await save([{ ...sub, addedAt: Date.now() }, ...rest].slice(0, MAX_DEVICES));
}

export async function removeAdminPushSub(endpoint: string): Promise<void> {
  const subs = await load();
  const rest = subs.filter((s) => s.endpoint !== endpoint);
  if (rest.length !== subs.length) await save(rest);
}

/** 등록된 관리자 기기 모두에 알림을 보냅니다. 보낸 기기 수를 돌려주고, 예외는 던지지 않습니다. */
export async function sendAdminPush(payload: { title: string; body: string; path?: string }, onlyEndpoint?: string): Promise<number> {
  try {
    if (!isPushConfigured()) return 0;
    const subs = await load();
    const targets = onlyEndpoint ? subs.filter((s) => s.endpoint === onlyEndpoint) : subs;
    if (targets.length === 0) return 0;
    const results = await Promise.all(
      targets.map((s) => sendPush(s, { title: payload.title, body: payload.body, url: payload.path ?? "/admin", tag: `admin-${Date.now()}` }))
    );
    // 브라우저에서 알림을 끄거나 앱을 지운 기기는 목록에서 뺍니다.
    const gone = new Set(targets.filter((_, i) => results[i] === "gone").map((s) => s.endpoint));
    if (gone.size > 0) await save(subs.filter((s) => !gone.has(s.endpoint)));
    return results.filter((r) => r === "ok").length;
  } catch (e) {
    console.warn("[adminPush] 전송 실패", e instanceof Error ? e.message : e);
    return 0;
  }
}
