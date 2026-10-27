// src/lib/trafficReport.ts
//
// 유입 경로별 성과 계산(관리자 통계 "유입 경로" 칸) — 글자·숫자만 다루는 함수라 테스트하기 쉽습니다.
//   방문자  : 그 채널로 처음 들어온 기기 수(첫 유입 기준)
//   재방문  : 그중 서로 다른 날 2번 이상 들어온 기기
//   회원    : 그중 로그인한 적이 있는 기기(가입했거나 회원으로 쓰는 사람)
//   신규 가입: 기간 안에 가입한 회원 중, 가입한 기기의 첫 유입이 그 채널인 사람
// 유입 경로 기록을 시작하기 전의 방문(채널 정보가 없는 기록)은 세지 않습니다.

export type PageViewRow = { user_key: string | null; auth_user_id: string | null; created_at: string; meta: { src?: unknown; fsrc?: unknown } | null };
export type MemberRow = { user_key: string | null; created_at: string | null };
export type ChannelStat = { channel: string; visitors: number; returning: number; members: number; signups: number };

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

export function buildTrafficReport(views: PageViewRow[], members: MemberRow[], since: string): { channels: ChannelStat[]; trackedVisitors: number } {
  type Device = { first: string | null; firstAt: string; days: Set<string>; member: boolean };
  const devices = new Map<string, Device>();
  for (const v of views) {
    if (!v.user_key) continue;
    const src = typeof v.meta?.fsrc === "string" ? v.meta.fsrc : typeof v.meta?.src === "string" ? v.meta.src : null;
    let d = devices.get(v.user_key);
    if (!d) { d = { first: null, firstAt: v.created_at, days: new Set(), member: false }; devices.set(v.user_key, d); }
    // 가장 이른 기록의 첫 유입을 씁니다
    if (src && (!d.first || v.created_at < d.firstAt)) { d.first = src; d.firstAt = v.created_at; }
    d.days.add(kstDay(v.created_at));
    if (v.auth_user_id) d.member = true;
  }
  const memberKeys = new Set(members.filter((m) => m.user_key).map((m) => m.user_key as string));
  const stats = new Map<string, ChannelStat>();
  const stat = (channel: string) => stats.get(channel) ?? stats.set(channel, { channel, visitors: 0, returning: 0, members: 0, signups: 0 }).get(channel)!;
  let tracked = 0;
  for (const [key, d] of devices) {
    if (!d.first) continue;
    tracked += 1;
    const s = stat(d.first);
    s.visitors += 1;
    if (d.days.size >= 2) s.returning += 1;
    if (d.member || memberKeys.has(key)) s.members += 1;
  }
  for (const m of members) {
    if (!m.user_key || !m.created_at || m.created_at < since) continue;
    const d = devices.get(m.user_key);
    if (d?.first) stat(d.first).signups += 1;
  }
  return { channels: [...stats.values()].sort((a, b) => b.visitors - a.visitors), trackedVisitors: tracked };
}
