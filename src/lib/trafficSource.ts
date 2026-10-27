// src/lib/trafficSource.ts
//
// 이용자가 "어디서 들어왔는지"(유입 경로) — 마케팅 채널별로 방문·회원 전환·재방문을 나눠 보기 위한 규칙.
//   · 홍보 링크에 붙인 꼬리표(?utm_source=naver_blog 등)가 있으면 그것을,
//   · 없으면 직전에 있던 사이트 주소(검색·SNS)로 알아내고,
//   · 둘 다 없으면 "직접 방문"으로 봅니다.
// 처음 들어온 경로(첫 유입)는 기기에 90일 동안 기억해, 나중에 다시 와서 가입해도 처음 데려온 채널의 성과로 셉니다.
// 글자만 다루는 함수라 테스트하기 쉽습니다(trafficSource.test.ts). 저장·전송은 components/AnalyticsTracker.tsx.

export type ChannelId =
  | "naver_blog" | "naver" | "instagram" | "threads" | "youtube" | "kakao" | "daangn" | "google" | "facebook" | "tiktok" | "qr"
  | "other" | "direct";

/** 관리자 화면에 보여 줄 이름과 홍보 링크 만들기에 쓰는 채널 목록(위에서부터 링크 만들기 버튼 순서) */
export const CHANNELS: { id: ChannelId; label: string; linkable: boolean }[] = [
  { id: "naver_blog", label: "네이버 블로그", linkable: true },
  { id: "instagram", label: "인스타그램", linkable: true },
  { id: "threads", label: "스레드", linkable: true },
  { id: "youtube", label: "유튜브·쇼츠", linkable: true },
  { id: "kakao", label: "카카오톡", linkable: true },
  { id: "daangn", label: "당근", linkable: true },
  { id: "tiktok", label: "틱톡", linkable: true },
  { id: "qr", label: "전단·QR", linkable: true },
  { id: "naver", label: "네이버 검색", linkable: false },
  { id: "google", label: "구글 검색", linkable: false },
  { id: "facebook", label: "페이스북", linkable: false },
  { id: "other", label: "다른 사이트", linkable: false },
  { id: "direct", label: "직접 방문·앱", linkable: false },
];
export const channelLabel = (id: string | null | undefined) => CHANNELS.find((c) => c.id === id)?.label ?? (id ? id : "알 수 없음");

const KNOWN = new Set(CHANNELS.map((c) => c.id as string));
/** 꼬리표 값을 다듬습니다(영문·숫자·_- 만, 40자까지). 정해진 채널 이름이면 그대로, 아니면 그 값을 그대로 씁니다(직접 만든 캠페인). */
export function cleanTag(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return v || null;
}

/** 직전 사이트 주소로 채널을 알아냅니다 */
export function channelFromReferrer(referrer: string | null | undefined, ownHost?: string): ChannelId {
  if (!referrer) return "direct";
  let host = "", path = "";
  try { const u = new URL(referrer); host = u.hostname.toLowerCase(); path = u.pathname; } catch { return "direct"; }
  if (ownHost && host === ownHost.toLowerCase()) return "direct";
  if (host.includes("blog.naver") || (host.endsWith("naver.com") && path.startsWith("/PostView"))) return "naver_blog";
  if (host.endsWith("naver.com") || host.endsWith("naver.net")) return "naver";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("threads.net") || host.includes("threads.com")) return "threads";
  if (host.includes("youtube") || host === "youtu.be") return "youtube";
  if (host.includes("kakao") || host.includes("daum.net")) return "kakao";
  if (host.includes("daangn") || host.includes("karrot")) return "daangn";
  if (host.includes("google.")) return "google";
  if (host.includes("facebook") || host === "fb.me" || host === "l.facebook.com") return "facebook";
  if (host.includes("tiktok")) return "tiktok";
  return "other";
}

export type Touch = { src: string; cmp: string | null; at: number };

/** 이번 방문의 유입 경로. 꼬리표(utm_source)가 있으면 그것, 없으면 직전 사이트 */
export function touchFrom(search: string, referrer: string | null | undefined, ownHost: string | undefined, now = Date.now()): Touch {
  const params = new URLSearchParams(search);
  const tagged = cleanTag(params.get("utm_source") ?? params.get("ref"));
  return {
    src: tagged ?? channelFromReferrer(referrer, ownHost),
    cmp: cleanTag(params.get("utm_campaign")),
    at: now,
  };
}

/** 첫 유입은 90일 동안 유지하되, 그동안 기록이 "직접 방문"뿐이었다면 새로 알게 된 채널로 바꿉니다 */
export const FIRST_TOUCH_DAYS = 90;
export function nextFirstTouch(saved: Touch | null, current: Touch, now = Date.now()): Touch {
  if (!saved || now - saved.at > FIRST_TOUCH_DAYS * 86_400_000) return current;
  if (saved.src === "direct" && current.src !== "direct") return current;
  return saved;
}

/** 관리자 화면의 홍보 링크(이 링크로 들어온 사람은 그 채널로 셉니다) */
export function campaignLink(siteUrl: string, channel: string, campaign?: string | null): string {
  const url = new URL(siteUrl.replace(/\/$/, "") + "/");
  url.searchParams.set("utm_source", cleanTag(channel) ?? "other");
  const cmp = cleanTag(campaign);
  if (cmp) url.searchParams.set("utm_campaign", cmp);
  return url.toString();
}

export const isKnownChannel = (id: string) => KNOWN.has(id);
