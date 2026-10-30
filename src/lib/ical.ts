// 객실 달력 주고받기(iCal) — 다른 예약 사이트(에어비앤비·부킹닷컴 등)와 같은 객실을 함께 팔 때 중복 예약을 막습니다.
//   · 가져오기: 그쪽 달력 주소의 일정(VEVENT)에서 "숙박하는 밤"을 뽑아 같이가개에서 그날을 막습니다.
//     DTEND는 체크아웃 날이라 그 밤은 포함하지 않습니다(종일 일정 기준). 시각이 있는 일정은 날짜 부분만 씁니다.
//   · 내보내기: 같이가개 예약(확정·대기)과 사장님이 막은 날을 종일 일정으로 만들어 그쪽 사이트가 가져가게 합니다.
// 글자만 다루는 함수라 서버와 테스트가 같이 씁니다.

const DAY = 86_400_000;
const addDay = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const toDay = (v: string) => { const m = v.match(/(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

/** 긴 줄 이어 붙이기(RFC 5545: 다음 줄이 공백으로 시작하면 이어지는 줄) */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** iCal 글에서 [from, to) 안의 막힌 밤(날짜) 목록 — 취소된 일정은 뺍니다 */
export function parseIcalNights(text: string, from: string, to: string, maxNights = 400): { day: string; summary: string | null }[] {
  const out = new Map<string, string | null>();
  let inEvent = false, start: string | null = null, end: string | null = null, summary: string | null = null, cancelled = false;
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) { inEvent = true; start = end = summary = null; cancelled = false; continue; }
    if (!inEvent) continue;
    if (upper.startsWith("END:VEVENT")) {
      inEvent = false;
      if (!start || cancelled) continue;
      const last = end && end > start ? end : addDay(start, 1);
      for (let d = start, n = 0; d < last && n < maxNights; d = addDay(d, 1), n++) if (d >= from && d < to) out.set(d, summary);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = upper.slice(0, idx).split(";")[0];
    const value = line.slice(idx + 1).trim();
    if (key === "DTSTART") start = toDay(value);
    else if (key === "DTEND") end = toDay(value);
    else if (key === "SUMMARY") summary = value.slice(0, 80) || null;
    else if (key === "STATUS" && value.toUpperCase() === "CANCELLED") cancelled = true;
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, s]) => ({ day, summary: s }));
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const ymd = (day: string) => day.replace(/-/g, "");

/** 내보내기용 달력 — 예약(체크인~체크아웃)과 막은 날(하루씩)을 종일 일정으로 */
export function buildIcal(calName: string, stays: { id: number; check_in: string; check_out: string }[], closedDays: string[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//gachigagae//lodging//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calName)}`];
  for (const s of stays) {
    lines.push("BEGIN:VEVENT", `UID:stay-${s.id}@gachigagae`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(s.check_in)}`, `DTEND;VALUE=DATE:${ymd(s.check_out)}`, "SUMMARY:같이가개 예약", "END:VEVENT");
  }
  for (const d of closedDays) {
    lines.push("BEGIN:VEVENT", `UID:closed-${ymd(d)}@gachigagae`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(addDay(d, 1))}`, "SUMMARY:예약 막음", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** 가져올 달력 주소 확인 — https만, 내부 주소(localhost·사설 IP)는 막습니다 */
export function cleanIcalUrl(raw: unknown): { url: string | null } | { error: string } {
  if (raw == null || raw === "") return { url: null };
  if (typeof raw !== "string") return { error: "달력 주소를 다시 확인해 주세요." };
  const text = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try { u = new URL(text); } catch { return { error: "달력 주소를 다시 확인해 주세요. (https://로 시작)" }; }
  if (u.protocol !== "https:" || text.length > 1000) return { error: "https://로 시작하는 달력 주소만 넣을 수 있어요." };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return { error: "이 달력 주소는 쓸 수 없어요." };
  return { url: u.toString() };
}
