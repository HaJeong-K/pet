// src/lib/server/shelterPush.ts
//
// 유기동물 공고 지역 알림(브라우저 알림, 서버 전용).
//   - 구독: 사용자가 공고 화면에서 "내 지역 새 공고 알림"을 켜면 /api/push/subscribe가 push_subscriptions에 저장
//   - 발송: 새벽 자동 작업(/api/cron/daily)이 구독자가 있는 지역마다 새 공고를 찾아 알림을 보냅니다.
// "새 공고" 판정: 지역별로 이미 본 공고 번호를 비공개 저장소에 기억해 두고, 그 목록에 없는 공고만 새 공고로 봅니다.
// 어떤 지역을 처음 확인할 때는 기준만 잡고 알림은 보내지 않습니다(이미 올라와 있던 공고가 한꺼번에 오지 않게).

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { getRegionShelterNotices, normalizeSidoName, SIDO_CODE_MAP } from "@/lib/shelterNotices";
import { siteUrl } from "@/lib/siteUrl";

const BUCKET = "app-private";
const SEEN_FILE = "shelter-notices-seen.json";
/** 지역별로 기억해 두는 공고 번호 수(공고는 10일쯤 유지되므로 넉넉히) */
const SEEN_KEEP = 400;
/** 사이트 하단에 공개된 고객센터 이메일 — 알림 발송 서버(구글·애플 등)가 문제 발생 시 연락하는 용도 */
const CONTACT_MAILTO = "mailto:infoker12@naver.com";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure(): boolean {
  if (!isPushConfigured()) return false;
  // 알림 발송 표준(VAPID)은 문의 연락처로 https 주소나 이메일(mailto:)을 요구합니다. 개발 환경의
  // http://localhost는 거절되므로, https 사이트 주소가 아니면 고객센터 이메일을 씁니다.
  const subject = process.env.VAPID_SUBJECT || (siteUrl.startsWith("https://") ? siteUrl : CONTACT_MAILTO);
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return true;
}

/** 알림을 받을 수 있는 시/도인지(짧은 이름으로 정규화해서 돌려줌) */
export function normalizeRegion(region: unknown): string | null {
  if (typeof region !== "string") return null;
  const short = normalizeSidoName(region.trim());
  return SIDO_CODE_MAP[short] ? short : null;
}

type SeenMap = Record<string, string[]>;

async function loadSeen(): Promise<SeenMap> {
  const { data, error } = await admin().storage.from(BUCKET).download(SEEN_FILE);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) as SeenMap; } catch { return {}; }
}

async function saveSeen(seen: SeenMap): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  await client.storage.from(BUCKET).upload(SEEN_FILE, Buffer.from(JSON.stringify(seen)), { upsert: true, contentType: "application/json" });
}

export type PushPayload = { title: string; body: string; url: string; tag?: string; image?: string };

/** 구독 하나에 알림을 보냅니다. 구독이 만료·해지됐으면 "gone"(DB에서 지워야 함). */
async function sendOne(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<"ok" | "gone" | "fail"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60 }
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "fail";
  }
}

export async function runShelterPush(): Promise<{ regions: number; newNotices: number; sent: number; removed: number; skipped?: string }> {
  if (!configure()) return { regions: 0, newNotices: 0, sent: 0, removed: 0, skipped: "알림 발송 키(VAPID) 없음" };
  const client = admin();

  const { data: subs, error } = await client.from("push_subscriptions").select("endpoint, p256dh, auth, region");
  if (error) {
    // 테이블을 아직 만들지 않은 상태는 실패가 아니라 건너뜀으로 봅니다.
    if (/push_subscriptions/.test(error.message)) return { regions: 0, newNotices: 0, sent: 0, removed: 0, skipped: "push_subscriptions 테이블 없음" };
    throw new Error(error.message);
  }
  if (!subs || subs.length === 0) return { regions: 0, newNotices: 0, sent: 0, removed: 0 };

  const byRegion = new Map<string, typeof subs>();
  for (const s of subs) byRegion.set(s.region, [...(byRegion.get(s.region) || []), s]);

  const seen = await loadSeen();
  let newNotices = 0, sent = 0;
  const gone: string[] = [];
  const delivered: string[] = [];

  for (const [region, regionSubs] of byRegion) {
    const notices = await getRegionShelterNotices(region, 60).catch(() => []);
    if (notices.length === 0) continue;
    const known = new Set(seen[region] || []);
    const firstCheck = !seen[region];
    const fresh = notices.filter((n) => !known.has(n.desertionNo));
    seen[region] = [...notices.map((n) => n.desertionNo), ...(seen[region] || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, SEEN_KEEP);
    if (firstCheck || fresh.length === 0) continue;

    newNotices += fresh.length;
    const breeds = [...new Set(fresh.map((n) => n.breed).filter(Boolean))].slice(0, 3).join(", ");
    const payload: PushPayload = {
      title: `${region}에 새 보호동물 공고 ${fresh.length}건`,
      body: `${breeds || "새 가족을 기다리는 아이들"}${fresh.length > 3 ? " 외" : ""} — 눌러서 확인해 보세요.`,
      url: fresh.length === 1 ? `/shelter-notices/${fresh[0].desertionNo}` : `/shelter-notices?region=${encodeURIComponent(region)}`,
      tag: `shelter-${region}`,
      image: fresh.find((n) => n.imageUrl)?.imageUrl,
    };
    const results = await Promise.all(regionSubs.map((s) => sendOne(s, payload)));
    results.forEach((r, i) => {
      if (r === "ok") { sent++; delivered.push(regionSubs[i].endpoint); }
      else if (r === "gone") gone.push(regionSubs[i].endpoint);
    });
  }

  await saveSeen(seen);
  if (gone.length > 0) await client.from("push_subscriptions").delete().in("endpoint", gone);
  if (delivered.length > 0) await client.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("endpoint", delivered);
  return { regions: byRegion.size, newNotices, sent, removed: gone.length };
}

/** 방금 구독한 브라우저에 확인 알림을 보냅니다(알림이 실제로 오는지 바로 확인할 수 있게). */
export async function sendWelcomePush(sub: { endpoint: string; p256dh: string; auth: string }, region: string): Promise<boolean> {
  if (!configure()) return false;
  const r = await sendOne(sub, {
    title: "알림이 켜졌어요",
    body: `${region}에 새 보호동물 공고가 올라오면 알려드릴게요.`,
    url: `/shelter-notices?region=${encodeURIComponent(region)}`,
    tag: "shelter-welcome",
  });
  return r === "ok";
}
