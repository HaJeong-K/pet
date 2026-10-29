// 사장님 "성과 보고서"(상세판) 계산 규칙 — 인쇄·PDF 저장용 보고서에만 씁니다(화면의 간단 보고서는 그대로).
//   · 지표: 노출(AI 코스·추천 목록·배너) → 클릭 → 상세 조회 → 방문·문의 행동(길찾기·전화·홈페이지)
//   · 비교 기준(둘 중 가능한 것 모두):
//       ① 무료 이용 대비 — 유료 요금제를 시작하기 전(무료로 쓰던 기간)과 시작한 뒤를 하루 평균으로 비교
//       ② 비슷한 무료 업체 대비 — 같은 지역·같은 업종의 무료 업체 평균(업체 이름은 밝히지 않음)
//   · 개선 제안: 숫자를 보고 정해진 규칙으로 자동 작성
// 서버(/api/owner/report)와 테스트가 같이 씁니다.

export const REPORT_DAYS = 30;
/** 무료 기간과 비교하려면 최소 이만큼의 날이 있어야 합니다 */
export const MIN_BASELINE_DAYS = 7;

export type MetricKey =
  | "views" | "courseImpressions" | "courseClicks" | "courseDirections" | "recImpressions" | "recClicks"
  | "bannerViews" | "bannerClicks" | "directions" | "calls" | "website";

export const METRICS: { key: MetricKey; label: string; desc: string; event: string }[] = [
  { key: "views", label: "상세 조회", desc: "가게 상세 화면이 열린 횟수", event: "place_view" },
  { key: "courseImpressions", label: "AI 코스 추천", desc: "AI 산책·나들이 코스에 정거장으로 추천된 횟수", event: "course_impression" },
  { key: "courseClicks", label: "코스에서 클릭", desc: "코스 안에서 가게를 눌러 본 횟수", event: "course_stop_click" },
  { key: "courseDirections", label: "코스에서 길찾기", desc: "코스 안에서 가게로 길찾기를 연 횟수", event: "course_stop_directions" },
  { key: "recImpressions", label: "추천 목록 노출", desc: "추천 장소 목록에 보인 횟수", event: "rec_impression" },
  { key: "recClicks", label: "추천 목록 클릭", desc: "추천 목록에서 가게를 눌러 본 횟수", event: "rec_click" },
  { key: "bannerViews", label: "배너 노출", desc: "배너 광고가 보인 횟수", event: "banner_view" },
  { key: "bannerClicks", label: "배너 클릭", desc: "배너 광고를 누른 횟수", event: "banner_click" },
  { key: "directions", label: "길찾기", desc: "가게 상세에서 길찾기를 연 횟수", event: "place_directions" },
  { key: "calls", label: "전화", desc: "전화번호를 누른 횟수", event: "place_call" },
  { key: "website", label: "홈페이지", desc: "홈페이지 링크를 누른 횟수", event: "place_website" },
];
export const REPORT_EVENT_TYPES = [...new Set(METRICS.map((m) => m.event))];

export type Metrics = Record<MetricKey, number>;
export type ReportEvent = { event_type: string; place_id: string | number | null; created_at: string; meta?: unknown };

export const emptyMetrics = (): Metrics => Object.fromEntries(METRICS.map((m) => [m.key, 0])) as Metrics;

/** 코스·추천 노출 기록(meta)에 이 가게가 들어 있는지 */
function mentions(event: ReportEvent, placeId: number): boolean {
  const meta = (event.meta ?? {}) as { stops?: unknown[]; items?: { id?: unknown }[] };
  if (event.event_type === "course_impression") return Array.isArray(meta.stops) && meta.stops.some((s) => Number(s) === placeId);
  if (event.event_type === "rec_impression") return Array.isArray(meta.items) && meta.items.some((it) => Number(it?.id) === placeId);
  return false;
}

/** [from, to) 기간에 이 가게의 지표를 셉니다 */
export function countMetrics(events: ReportEvent[], placeId: number, fromMs: number, toMs: number): Metrics {
  const out = emptyMetrics();
  const byEvent = new Map(METRICS.map((m) => [m.event, m.key]));
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    if (t < fromMs || t >= toMs) continue;
    const key = byEvent.get(e.event_type);
    if (!key) continue;
    const isImpression = e.event_type === "course_impression" || e.event_type === "rec_impression";
    if (isImpression ? mentions(e, placeId) : Number(e.place_id) === placeId) out[key]++;
  }
  return out;
}

/** 노출 합계(코스+추천+배너), 클릭 합계, 방문·문의 행동 합계 */
export function totals(m: Metrics) {
  const exposure = m.courseImpressions + m.recImpressions + m.bannerViews;
  const clicks = m.courseClicks + m.recClicks + m.bannerClicks;
  const actions = m.directions + m.courseDirections + m.calls + m.website;
  return { exposure, clicks, actions, views: m.views };
}

/** 기간 길이가 다를 때 30일 기준으로 맞춘 값 */
export function scaleTo30(m: Metrics, days: number): Metrics {
  const f = days > 0 ? REPORT_DAYS / days : 0;
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * f * 10) / 10])) as Metrics;
}

/** 여러 업체의 평균 */
export function averageMetrics(list: Metrics[]): Metrics {
  const out = emptyMetrics();
  if (list.length === 0) return out;
  for (const m of list) for (const k of Object.keys(out) as MetricKey[]) out[k] += m[k];
  for (const k of Object.keys(out) as MetricKey[]) out[k] = Math.round((out[k] / list.length) * 10) / 10;
  return out;
}

/** 증감률(%) — 비교 값이 0이면 null(“새로 생김”) */
export function changeRate(current: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round(((current - base) / base) * 1000) / 10;
}
export function changeText(current: number, base: number): string {
  const r = changeRate(current, base);
  if (r == null) return current > 0 ? "새로 발생" : "-";
  if (r === 0) return "변화 없음";
  return `${r > 0 ? "+" : ""}${r}%`;
}
export const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** 요일별 조회(일~토) */
export function weekdayViews(events: ReportEvent[], placeId: number, fromMs: number, toMs: number): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const e of events) {
    if (e.event_type !== "place_view" || Number(e.place_id) !== placeId) continue;
    const t = new Date(e.created_at).getTime();
    if (t < fromMs || t >= toMs) continue;
    out[new Date(t + 9 * 3_600_000).getUTCDay()]++;
  }
  return out;
}

export type InsightInput = {
  current: Metrics; previous: Metrics; peers: Metrics | null; beforePaid: Metrics | null;
  hasPhoto: boolean; hasPhone: boolean; hasWebsite: boolean; reviewReplyRate: number | null; isBannerPlan: boolean;
};

/** 숫자를 보고 자동으로 쓰는 "주요 성과"와 "개선 제안" */
export function buildInsights(x: InsightInput): { highlights: string[]; suggestions: string[] } {
  const cur = totals(x.current), prev = totals(x.previous);
  const highlights: string[] = [];
  const suggestions: string[] = [];
  const viewChange = changeRate(cur.views, prev.views);
  if (viewChange != null) highlights.push(`상세 조회가 직전 30일보다 ${viewChange >= 0 ? `${viewChange}% 늘었습니다` : `${Math.abs(viewChange)}% 줄었습니다`}(${prev.views}회 → ${cur.views}회).`);
  else if (cur.views > 0) highlights.push(`최근 30일 동안 상세 조회 ${cur.views}회가 새로 발생했습니다.`);
  if (x.beforePaid) {
    const b = totals(x.beforePaid);
    const r = changeRate(cur.views, b.views);
    if (r != null) highlights.push(`무료로 이용하던 기간보다 상세 조회가 ${r >= 0 ? `${r}% 많습니다` : `${Math.abs(r)}% 적습니다`}(30일 환산 ${b.views}회 → ${cur.views}회).`);
    const e = changeRate(cur.exposure, b.exposure);
    if (e != null && e > 0) highlights.push(`AI 코스·추천 목록 등 노출이 무료 기간보다 ${e}% 늘었습니다.`);
  }
  if (x.peers) {
    const p = totals(x.peers);
    if (p.views > 0) {
      const r = changeRate(cur.views, p.views);
      if (r != null) highlights.push(`비슷한 무료 업체 평균(${p.views}회)보다 상세 조회가 ${r >= 0 ? `${r}% 많습니다` : `${Math.abs(r)}% 적습니다`}.`);
    }
    if (x.current.courseImpressions > x.peers.courseImpressions) highlights.push(`AI 코스 추천 횟수가 비슷한 무료 업체 평균보다 ${Math.round((x.current.courseImpressions - x.peers.courseImpressions) * 10) / 10}회 많습니다.`);
  }
  const ctr = ratio(cur.clicks, cur.exposure);
  const conv = ratio(cur.actions, cur.views);
  if (!x.hasPhoto) suggestions.push("가게 사진을 올려 주세요. 사진이 있는 가게는 목록·코스에서 더 많이 눌립니다.");
  if (cur.exposure >= 20 && ctr != null && ctr < 5) suggestions.push(`노출 대비 클릭률이 ${ctr}%입니다. 대표 사진과 가게 소개 문구를 손보면 클릭이 늘 수 있습니다.`);
  if (cur.views >= 10 && conv != null && conv < 10) suggestions.push(`상세 조회 대비 길찾기·전화 등 행동이 ${conv}%입니다. 영업시간·반려동물 동반 조건을 자세히 적어 방문을 돕는 것을 권합니다.`);
  if (!x.hasPhone) suggestions.push("전화번호를 등록하면 손님이 바로 문의할 수 있습니다.");
  if (!x.hasWebsite) suggestions.push("홈페이지·SNS 주소를 등록하면 가게를 더 자세히 알릴 수 있습니다.");
  if (x.reviewReplyRate != null && x.reviewReplyRate < 100) suggestions.push(`후기 답글률이 ${x.reviewReplyRate}%입니다. 답글을 달면 다음 손님의 신뢰가 높아집니다.`);
  if (x.isBannerPlan && x.current.bannerViews > 0 && (ratio(x.current.bannerClicks, x.current.bannerViews) ?? 0) < 1) suggestions.push("배너 클릭률이 1% 미만입니다. 배너 문구에 할인·이벤트 같은 혜택을 넣어 보세요.");
  if (suggestions.length === 0) suggestions.push("지금처럼 정보를 최신으로 유지하고, 공지로 이벤트·휴무를 알려 주세요.");
  return { highlights, suggestions };
}
