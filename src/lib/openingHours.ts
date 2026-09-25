// src/lib/openingHours.ts
//
// 운영시간·휴무일 문자열 → "그 시각에 영업 중인가" 판정.
//
// 공공데이터(관광공사/문화정보원/식약처)와 사용자 제보의 운영시간은 정해진 형식이 없는
// 자유 텍스트라("09:00~18:00", "매일 10:00 - 22:00 (월요일 휴무)", "평일 09:00~18:00 /
// 주말 10:00~17:00", "24시간" …) 완벽한 파싱은 불가능합니다. 그래서 확실할 때만
// "open"/"closed"를 돌려주고, 애매하면 항상 "unknown"을 돌려줍니다 — 추천 쪽에서는
// "closed"만 제외하고 "unknown"은 소폭 불리하게만 다뤄서, 파싱 실패 때문에 멀쩡한 장소가
// 코스에서 사라지는 일이 없게 합니다.

export type OpenStatus = "open" | "closed" | "unknown";

const WEEKDAY_CHARS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 휴무일 문자열에 오늘 요일이 "매주 쉬는 날"로 적혀 있는지. 격주·N째 주처럼 조건부면 false */
export function isClosedDay(closedDays: string | null | undefined, date: Date): boolean {
  if (!closedDays) return false;
  const text = closedDays.trim();
  if (!text || /연중무휴|없음|무휴/.test(text)) return false;
  // 격주/첫째·셋째 주/공휴일 등 조건부 휴무는 오늘이 해당하는지 알 수 없으므로 판정 보류
  if (/격주|첫째|둘째|셋째|넷째|마지막|\d\s*주/.test(text)) return false;

  const today = WEEKDAY_CHARS[date.getDay()];
  if (new RegExp(`${today}요일`).test(text)) return true;
  // "월, 화" / "월·화" 처럼 요일 글자만 나열한 짧은 형식
  if (/^[월화수목금토일,\s·/]+$/.test(text) && text.includes(today)) return true;
  return false;
}

/** 운영시간 문자열에서 "X요일 휴무" 형태로 오늘이 쉬는 날인지 */
function hoursMentionsClosedToday(hours: string, date: Date): boolean {
  const today = WEEKDAY_CHARS[date.getDay()];
  return new RegExp(`(매주\\s*)?${today}요일\\s*(정기\\s*)?휴무`).test(hours);
}

type Range = { start: number; end: number };

function parseRanges(hours: string): Range[] {
  const ranges: Range[] = [];
  const re = /(\d{1,2})\s*[:시]\s*(\d{2})?\s*분?\s*[~\-–〜]\s*(익일\s*)?(\d{1,2})\s*[:시]\s*(\d{2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hours)) !== null) {
    const sh = Number(m[1]);
    const sm = Number(m[2] ?? 0);
    const eh = Number(m[4]);
    const em = Number(m[5] ?? 0);
    if (sh > 30 || eh > 30 || sm > 59 || em > 59) continue;
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    // 자정을 넘기는 영업(예: 18:00~02:00)은 끝 시각을 다음날로 넘겨서 계산합니다.
    if (end <= start || m[3]) end += 24 * 60;
    ranges.push({ start, end });
  }
  return ranges;
}

function inRange(range: Range, minuteOfDay: number): boolean {
  return (
    (minuteOfDay >= range.start && minuteOfDay < range.end) ||
    // 전날 시작해 자정을 넘긴 영업시간이 오늘 새벽까지 이어지는 경우
    (range.end > 24 * 60 && minuteOfDay + 24 * 60 < range.end)
  );
}

export function getOpenStatus(
  hours: string | null | undefined,
  closedDays: string | null | undefined,
  date: Date
): OpenStatus {
  if (isClosedDay(closedDays, date)) return "closed";
  if (!hours || !hours.trim() || hours.trim() === "정보없음") return "unknown";
  const text = hours.trim();
  if (hoursMentionsClosedToday(text, date)) return "closed";
  if (/24\s*시간|24h|00:00\s*[~\-]\s*24:00/i.test(text)) return "open";

  const ranges = parseRanges(text);
  if (ranges.length === 0) return "unknown";

  const minute = date.getHours() * 60 + date.getMinutes();
  if (ranges.some((r) => inRange(r, minute))) return "open";

  // 요일 구분(평일/주말/토/일 …)이 없으면 적힌 시간대가 매일 적용되므로, 모두 밖이면
  // 확실히 영업 외 시간입니다. 요일 구분이 섞여 있으면 어느 시간대가 오늘 것인지(또는
  // 오늘 영업을 하는지) 알 수 없어 판정을 보류합니다. "X요일 휴무" 문구는 위에서 이미
  // 처리했으므로 요일 구분 판정에서는 빼고 봅니다.
  const withoutHoliday = text.replace(/\d+월/g, "").replace(/[월화수목금토일]요일\s*(정기\s*)?휴무/g, "");
  const hasDayQualifier = /평일|주말|공휴일|[월화수목금토]요|일요|[월화수목금토일]\s*[~\-,·]\s*[월화수목금토일]/.test(withoutHoliday);
  return hasDayQualifier ? "unknown" : "closed";
}
