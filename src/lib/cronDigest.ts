// src/lib/cronDigest.ts
//
// 새벽 자동 작업 결과 알림(카카오톡 한 통 + 앱 알림)의 문구를 만듭니다.
//   · 지도 장소 수를 공공데이터별로(문화시설·관광공사·음식점) 어제와 비교해 보여 주고
//   · 관광공사 목록이 어제보다 줄거나 늘면 몇 곳인지와 장소 이름을 보여 줍니다.
//     (관광공사가 자기 목록에서 뺀 장소는 다음 날 지도에서도 빠지는데, 예전엔 알림이 없었습니다.)
//   · 요일마다 도는 작업(공원·폐업·품질·음식점 파일·문화시설 파일)은 그날 돈 것만 담습니다.
// 카카오톡 텍스트 메시지는 200자까지라, 중요한 줄부터 넣고 이름 목록을 줄여 가며 맞춥니다.
// 앱 알림에는 이름을 더 많이 담은 긴 문구를 보냅니다.
// 글자·숫자만 다루는 함수라 테스트하기 쉽습니다(cronDigest.test.ts). 연결: app/api/cron/daily/route.ts

export type TourEntry = { id: string; name: string };
export type MapCounts = { total: number; culture: number; tour: number; foodsafety: number };

/** 카카오톡 텍스트 메시지 본문 최대 길이(src/lib/server/kakaoTalk.ts와 같음) */
export const KAKAO_MAX = 200;
/** 이보다 많이 줄면 목록을 다 못 받은 것으로 보고 기준(어제 목록)을 바꾸지 않습니다 */
export const TOUR_DROP_SUSPICIOUS = 0.1;

/** 어제 목록과 오늘 목록 비교 — 빠진 곳·새로 생긴 곳 */
export function diffTourList(prev: TourEntry[], next: TourEntry[]): { added: TourEntry[]; removed: TourEntry[] } {
  const prevIds = new Set(prev.map((e) => e.id));
  const nextIds = new Set(next.map((e) => e.id));
  return {
    added: next.filter((e) => !prevIds.has(e.id)),
    removed: prev.filter((e) => !nextIds.has(e.id)),
  };
}

/** 오늘 목록이 비었거나 어제보다 10% 넘게 줄면 '받다 만 목록'으로 의심합니다 */
export function isSuspiciousDrop(prevTotal: number, nextTotal: number): boolean {
  if (nextTotal === 0) return true;
  return prevTotal > 0 && nextTotal < prevTotal * (1 - TOUR_DROP_SUSPICIOUS);
}

/** 지도 장소를 공공데이터별로 셉니다(sourceId 앞부분: culture- · tour- · foodsafety-) */
export function countBySource(places: { sourceId?: string | null }[]): MapCounts {
  const c: MapCounts = { total: places.length, culture: 0, tour: 0, foodsafety: 0 };
  for (const p of places) {
    const src = String(p.sourceId ?? "").split("-")[0];
    if (src === "culture" || src === "tour" || src === "foodsafety") c[src]++;
  }
  return c;
}

const n = (v: number) => v.toLocaleString("ko-KR");
/** 어제와 차이 — 0이면 빈 글자, 아니면 "(+3)" / "(-3)" */
export function delta(now: number, prev: number | null | undefined): string {
  if (prev == null) return "";
  const d = now - prev;
  return d === 0 ? "" : `(${d > 0 ? "+" : ""}${n(d)})`;
}

/** 이름 목록 — 앞의 max곳만 쓰고 나머지는 "외 n곳" */
export function namesText(list: TourEntry[], max: number): string {
  if (list.length === 0) return "";
  if (max <= 0) return `${n(list.length)}곳`;
  const shown = list.slice(0, max).map((e) => e.name || e.id);
  const rest = list.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` 외 ${n(rest)}곳` : "");
}

export type DigestInput = {
  /** 예: "10/28(화)" */
  dateLabel: string;
  failed: { name: string; error: string }[];
  map?: { now: MapCounts; prev?: MapCounts | null };
  tourList?: { total: number; prevTotal: number | null; added: TourEntry[]; removed: TourEntry[]; suspicious: boolean };
  tourDetails?: { fetched: number; have: number; total: number } | { skipped: string };
  backup?: { sizeKb?: number };
  parks?: { fetched: number; upserted: number };
  closure?: { checked: number; closed: number; suspended: number };
  quality?: { coords: number; duplicate: number; broken_image: number; missing_info: number };
  food?: { total: number; added: number; removed: number; pending: number };
  culture?: { changed: boolean; added?: number; removed?: number };
  shelter?: { newNotices: number; sent: number };
  cleanup?: { deleted: number };
  /** 처리 대기 항목(예: "제보 2") */
  pending: string[];
  errors24h: number;
};

/** 이름을 하나도 못 넣을 때 — 개수만 쓰고 이름은 앱 알림에서 보게 */
function namesOrCount(list: TourEntry[], names: number): string {
  return names > 0 ? `${n(list.length)}: ${namesText(list, names)}` : `${n(list.length)}곳(이름은 앱 알림)`;
}

/** 알림 문구 한 벌 — names: 빠짐·추가 줄에 보여 줄 이름 수, minor: 덜 중요한 줄(백업·입양 알림·정리)까지 넣을지 */
function buildLines(d: DigestInput, names: number, minor = true): string[] {
  const lines: string[] = [];
  for (const f of d.failed) lines.push(`실패 ${f.name}: ${f.error.slice(0, 30)}`);

  const t = d.tourList;
  if (t) {
    if (t.suspicious) {
      lines.push(`관광공사 목록 이상 ${n(t.total)}곳(어제 ${n(t.prevTotal ?? 0)}) — 기준 유지`);
    } else if (t.prevTotal == null) {
      lines.push(`관광공사 목록 ${n(t.total)}곳 (오늘부터 비교)`);
    } else if (t.removed.length === 0 && t.added.length === 0) {
      lines.push(`관광공사 목록 ${n(t.total)}곳 변동 없음`);
    } else {
      lines.push(`관광공사 목록 ${n(t.total)}곳${delta(t.total, t.prevTotal)}`);
      if (t.removed.length) lines.push(`빠짐 ${namesOrCount(t.removed, names)}`);
      if (t.added.length) lines.push(`추가 ${namesOrCount(t.added, names)}`);
    }
  }

  if (d.map) {
    const { now, prev } = d.map;
    lines.push(`지도 ${n(now.total)}곳${delta(now.total, prev?.total)}`);
    lines.push(`문화 ${n(now.culture)}${delta(now.culture, prev?.culture)} · 관광 ${n(now.tour)}${delta(now.tour, prev?.tour)} · 음식 ${n(now.foodsafety)}${delta(now.foodsafety, prev?.foodsafety)}`);
  }

  const td = d.tourDetails;
  if (td && "skipped" in td) lines.push(`관광 상세 미룸(${td.skipped.slice(0, 16)})`);
  else if (td) lines.push(`관광 상세 +${n(td.fetched)} (${n(td.have)}/${n(td.total)})`);

  if (d.parks) lines.push(`공원 ${n(d.parks.fetched)}곳 갱신`);
  if (d.closure) lines.push(`폐업 점검 ${n(d.closure.checked)}곳: 폐업 ${d.closure.closed}·휴업 ${d.closure.suspended}`);
  if (d.quality) {
    const q = d.quality;
    lines.push(`품질 점검: 좌표 ${q.coords}·중복 ${q.duplicate}·사진 ${q.broken_image}·정보 ${q.missing_info}`);
  }
  if (d.food) lines.push(`음식점 파일 ${n(d.food.total)}곳 +${d.food.added}/-${d.food.removed}${d.food.pending ? ` 좌표대기 ${d.food.pending}` : ""}`);
  if (d.culture) lines.push(d.culture.changed ? `문화시설 새 파일 +${d.culture.added ?? 0}/-${d.culture.removed ?? 0}` : "문화시설 파일 변동 없음");

  lines.push(d.pending.length ? `대기 ${d.pending.join("·")}` : "처리 대기 없음");
  if (d.errors24h > 0) lines.push(`오류 24시간 ${d.errors24h}건`);
  if (!minor) return lines;
  if (d.backup) lines.push(`DB 백업${d.backup.sizeKb ? ` ${n(d.backup.sizeKb)}KB` : " 완료"}`);
  if (d.shelter && d.shelter.newNotices > 0) lines.push(`입양 공고 알림 ${d.shelter.newNotices}건 → ${d.shelter.sent}명`);
  if (d.cleanup && d.cleanup.deleted > 0) lines.push(`오류 기록 정리 ${d.cleanup.deleted}건`);
  return lines;
}

/** notify.ts가 카카오톡에 보내는 모양 그대로의 길이 */
export function kakaoLength(title: string, lines: string[]): number {
  return [title, ...lines.map((l) => `• ${l}`)].join("\n").length;
}

/**
 * 새벽 작업 알림 — kakaoLines는 200자 안에 맞춘 것, pushLines는 이름을 더 담은 긴 것.
 * 200자를 넘으면 ① 이름을 2곳으로 ② 백업·입양 알림·정리 줄을 빼고 ③ 이름을 1곳 → 개수만으로 줄이고,
 * 그래도 넘으면 뒤쪽(덜 중요한) 줄부터 뺍니다. 빠진 장소 이름이 백업 같은 줄보다 중요해서 이 순서입니다.
 */
export function buildCronDigest(d: DigestInput): { title: string; kakaoLines: string[]; pushLines: string[] } {
  const title = d.failed.length ? `🚨 새벽 작업 ${d.dateLabel} 일부 실패` : `🌙 새벽 작업 ${d.dateLabel}`;
  const pushLines = buildLines(d, 20);
  const tries: [number, boolean][] = [[3, true], [2, true], [3, false], [2, false], [1, false], [0, false]];
  for (const [names, minor] of tries) {
    const lines = buildLines(d, names, minor);
    if (kakaoLength(title, lines) <= KAKAO_MAX) return { title, kakaoLines: lines, pushLines };
  }
  const lines = buildLines(d, 0, false);
  while (lines.length > 1 && kakaoLength(title, lines) > KAKAO_MAX) lines.pop();
  return { title, kakaoLines: lines, pushLines };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** 한국 날짜 표시 — "10/28(화)" */
export function kstDateLabel(now = Date.now()): string {
  const d = new Date(now + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
}
