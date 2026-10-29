"use client";

// 사장님 "성과 보고서" 상세판 — 화면에는 보이지 않고, "인쇄 · PDF 저장"을 누르면 이 보고서가 A4로 인쇄됩니다.
// 일반적인 마케팅 성과 보고서 순서:
//   표지 → 1. 요약(핵심 지표·주요 성과) → 2. 기간 비교 → 3. 유료 이용 효과(무료 이용 대비 / 비슷한 무료 업체 대비)
//   → 4. 고객 여정(노출→클릭→조회→행동) → 5. 일별 추이 → 6. 요일별 관심 → 7. 고객 반응 → 8. 개선 제안 → 9. 집계 기준
// 데이터는 /api/owner/report, 계산 규칙은 src/lib/ownerReport.ts.

import { changeText, METRICS, ratio, totals, type Metrics, type MetricKey } from "@/lib/ownerReport";

export type DetailedReport = {
  place: { id: number; name: string; category: string | null; address: string | null };
  plan: { id: string; name: string; expiresAt: string | null } | null;
  paidSince: string | null;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  trackingSince: string;
  current: Metrics; previous: Metrics;
  beforePaid: { metrics: Metrics; days: number; from: string; to: string } | null;
  peers: { metrics: Metrics; count: number; scope: string } | null;
  daily: { day: string; views: number; clicks: number }[];
  weekday: number[];
  reactions: { bookmarks: number; likes: number };
  reviews: { total: number; last30: number; replied: number };
  reviewReplyRate: number | null;
  insights: { highlights: string[]; suggestions: string[] };
  generatedAt: string;
};

const INK = "#1f2937", SUB = "#6b7280", LINE = "#e5e7eb", ACCENT = "#B45309", BLUE = "#1D4F91";
const dot = (d: string) => d.replace(/-/g, ".");
const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString("ko-KR") : v.toLocaleString("ko-KR", { maximumFractionDigits: 1 }));
const pct = (v: number | null) => (v == null ? "-" : `${v}%`);
const COMPARE_KEYS: MetricKey[] = ["views", "courseImpressions", "courseClicks", "recImpressions", "recClicks", "bannerViews", "bannerClicks", "directions", "courseDirections", "calls", "website"];
const label = (k: MetricKey) => METRICS.find((m) => m.key === k)!.label;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

const h2: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: INK, margin: "0 0 10px", paddingBottom: 6, borderBottom: `2px solid ${ACCENT}` };
const sectionStyle: React.CSSProperties = { marginTop: 26, breakInside: "avoid" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thS: React.CSSProperties = { padding: "7px 8px", background: "#F9FAFB", borderBottom: `1px solid ${LINE}`, color: SUB, fontWeight: 700, textAlign: "left" };
const tdS: React.CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${LINE}`, color: INK };
const note: React.CSSProperties = { fontSize: 11, color: SUB, lineHeight: 1.7, marginTop: 6 };

/** 막대 그래프 — 인쇄해도 글자가 늘어나지 않게 SVG 대신 상자로 그립니다 */
function Bars({ values, labels, color, height = 110 }: { values: number[]; labels: string[]; color: string; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label="막대 그래프">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, borderBottom: `1px solid ${LINE}` }}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i] || ""} ${v}`} style={{ flex: 1, height: `${Math.max((v / max) * 100, v > 0 ? 3 : 1)}%`, background: v > 0 ? color : LINE, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
        {labels.map((l, i) => <div key={i} style={{ flex: 1, fontSize: 9.5, color: SUB, textAlign: "center", whiteSpace: "nowrap", overflow: "visible" }}>{l}</div>)}
      </div>
    </div>
  );
}

function CompareTable({ ours, other, oursLabel, otherLabel }: { ours: Metrics; other: Metrics; oursLabel: string; otherLabel: string }) {
  return (
    <table style={table}>
      <thead><tr><th style={thS}>지표</th><th style={{ ...thS, textAlign: "right" }}>{oursLabel}</th><th style={{ ...thS, textAlign: "right" }}>{otherLabel}</th><th style={{ ...thS, textAlign: "right" }}>차이</th></tr></thead>
      <tbody>
        {COMPARE_KEYS.map((k) => (
          <tr key={k}>
            <td style={tdS}>{label(k)}</td>
            <td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(ours[k])}</td>
            <td style={{ ...tdS, textAlign: "right" }}>{n(other[k])}</td>
            <td style={{ ...tdS, textAlign: "right", fontWeight: 700, color: ours[k] >= other[k] ? "#15803D" : "#B91C1C" }}>{changeText(ours[k], other[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function OwnerDetailedReport({ r }: { r: DetailedReport }) {
  const cur = totals(r.current), prev = totals(r.previous);
  const kpis: [string, number, number][] = [["노출", cur.exposure, prev.exposure], ["클릭", cur.clicks, prev.clicks], ["상세 조회", cur.views, prev.views], ["방문·문의 행동", cur.actions, prev.actions]];
  const funnel: [string, number][] = [["노출(코스·추천·배너)", cur.exposure], ["클릭", cur.clicks], ["상세 조회", cur.views], ["방문·문의 행동", cur.actions]];
  const funnelMax = Math.max(1, ...funnel.map(([, v]) => v));
  const bestWeekday = r.weekday.indexOf(Math.max(...r.weekday));
  const generated = new Date(r.generatedAt);

  return (
    <div style={{ color: INK, fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif", fontSize: 12.5, lineHeight: 1.6, wordBreak: "keep-all" }}>
      {/* 표지 */}
      <div style={{ minHeight: "250mm", display: "flex", flexDirection: "column", justifyContent: "space-between", breakAfter: "page", padding: "20mm 6mm 10mm" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>같이가개 · 반려동물 동반 장소 플랫폼</div>
          <div style={{ fontSize: 32, fontWeight: 900, marginTop: 18, lineHeight: 1.3 }}>마케팅 성과 보고서</div>
          <div style={{ fontSize: 15, color: SUB, marginTop: 8 }}>노출 · 클릭 · 방문 전환 분석과 개선 제안</div>
        </div>
        <div style={{ borderTop: `3px solid ${ACCENT}`, paddingTop: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{r.place.name}</div>
          <table style={{ ...table, marginTop: 12, fontSize: 13 }}>
            <tbody>
              {[["업종", r.place.category ?? "-"], ["주소", r.place.address ?? "-"], ["분석 기간", `${dot(r.period.from)} ~ ${dot(r.period.to)} (30일)`],
                ["이용 요금제", r.plan ? `${r.plan.name}${r.paidSince ? ` (${dot(r.paidSince.slice(0, 10))} 시작)` : ""}` : "무료 이용"],
                ["작성일", generated.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })], ["발행", "같이가개"]].map(([k, v]) => (
                <tr key={k}><td style={{ padding: "5px 0", width: 110, color: SUB }}>{k}</td><td style={{ padding: "5px 0", fontWeight: 700 }}>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. 요약 */}
      <section style={{ breakInside: "avoid" }}>
        <h2 style={h2}>1. 요약</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {kpis.map(([k, v, p]) => (
            <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 10px" }}>
              <div style={{ fontSize: 11, color: SUB, fontWeight: 700 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{n(v)}</div>
              <div style={{ fontSize: 11, color: v >= p ? "#15803D" : "#B91C1C", fontWeight: 700 }}>직전 30일 대비 {changeText(v, p)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#FFFBEB", borderLeft: `4px solid ${ACCENT}` }}>
          <b>주요 성과</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {(r.insights.highlights.length ? r.insights.highlights : ["분석 기간 동안 쌓인 기록이 적어 주요 성과를 뽑기 어렵습니다. 기록이 쌓이면 자동으로 채워집니다."]).map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      </section>

      {/* 2. 기간 비교 */}
      <section style={sectionStyle}>
        <h2 style={h2}>2. 기간 비교</h2>
        <table style={table}>
          <thead><tr><th style={thS}>지표</th><th style={thS}>설명</th><th style={{ ...thS, textAlign: "right" }}>최근 30일</th><th style={{ ...thS, textAlign: "right" }}>직전 30일</th><th style={{ ...thS, textAlign: "right" }}>증감</th></tr></thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key}>
                <td style={{ ...tdS, fontWeight: 700, whiteSpace: "nowrap" }}>{m.label}</td>
                <td style={{ ...tdS, color: SUB, fontSize: 11 }}>{m.desc}</td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(r.current[m.key])}</td>
                <td style={{ ...tdS, textAlign: "right" }}>{n(r.previous[m.key])}</td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }}>{changeText(r.current[m.key], r.previous[m.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={note}>최근 30일 {dot(r.period.from)} ~ {dot(r.period.to)} · 직전 30일 {dot(r.period.previousFrom)} ~ {dot(r.period.previousTo)}</div>
      </section>

      {/* 3. 유료 이용 효과 */}
      <section style={{ ...sectionStyle, breakBefore: "page" }}>
        <h2 style={h2}>3. 유료 이용 효과 분석</h2>
        {r.beforePaid && (
          <div style={{ breakInside: "avoid" }}>
            <h3 style={{ fontSize: 13.5, margin: "4px 0 6px" }}>3-1. 무료 이용 기간 대비</h3>
            <div style={{ ...note, marginTop: 0, marginBottom: 6 }}>
              유료 요금제 시작 전 무료로 이용한 {r.beforePaid.days}일({dot(r.beforePaid.from)} ~ {dot(r.beforePaid.to)})의 기록을 30일 기준으로 환산해 최근 30일과 비교했습니다.
            </div>
            <CompareTable ours={r.current} other={r.beforePaid.metrics} oursLabel="유료 이용(최근 30일)" otherLabel="무료 이용(30일 환산)" />
          </div>
        )}
        {r.peers && (
          <div style={{ breakInside: "avoid", marginTop: r.beforePaid ? 18 : 0 }}>
            <h3 style={{ fontSize: 13.5, margin: "4px 0 6px" }}>{r.beforePaid ? "3-2" : "3-1"}. 비슷한 무료 업체 대비</h3>
            <div style={{ ...note, marginTop: 0, marginBottom: 6 }}>
              {r.peers.scope} 무료 업체 {r.peers.count}곳의 최근 30일 평균과 비교했습니다. 개별 업체의 이름은 공개하지 않습니다.
            </div>
            <CompareTable ours={r.current} other={r.peers.metrics} oursLabel="우리 가게" otherLabel="무료 업체 평균" />
          </div>
        )}
        {!r.beforePaid && !r.peers && <div style={{ color: SUB }}>비교할 무료 이용 기간이나 비슷한 무료 업체 기록이 아직 부족합니다. 기록이 쌓이면 자동으로 채워집니다.</div>}
        {r.paidSince == null && <div style={note}>지금은 무료로 이용 중입니다. 유료 요금제를 시작하면 이 항목에서 무료 기간과 비교한 효과를 보여 드립니다.</div>}
      </section>

      {/* 4. 고객 여정 */}
      <section style={sectionStyle}>
        <h2 style={h2}>4. 고객 여정(전환 단계)</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {funnel.map(([k, v], i) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{k}</span>
              <div style={{ height: 14, background: "#F3F4F6", borderRadius: 3 }}><div style={{ width: `${(v / funnelMax) * 100}%`, height: "100%", background: i === 0 ? "#FCD34D" : i === 1 ? "#F59E0B" : i === 2 ? ACCENT : "#78350F", borderRadius: 3 }} /></div>
              <span style={{ textAlign: "right", fontWeight: 800 }}>{n(v)}회</span>
            </div>
          ))}
        </div>
        <table style={{ ...table, marginTop: 10 }}>
          <tbody>
            <tr><td style={tdS}>노출 대비 클릭률</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{pct(ratio(cur.clicks, cur.exposure))}</td></tr>
            <tr><td style={tdS}>상세 조회 대비 방문·문의 행동</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{pct(ratio(cur.actions, cur.views))}</td></tr>
            {r.current.bannerViews > 0 && <tr><td style={tdS}>배너 클릭률</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{pct(ratio(r.current.bannerClicks, r.current.bannerViews))}</td></tr>}
          </tbody>
        </table>
      </section>

      {/* 5. 일별 추이 */}
      <section style={{ ...sectionStyle, breakBefore: "page" }}>
        <h2 style={h2}>5. 일별 추이(최근 30일)</h2>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>상세 조회</div>
        <Bars values={r.daily.map((d) => d.views)} labels={r.daily.map((d, i) => (i % 5 === 0 ? d.day.slice(5).replace("-", "/") : ""))} color={ACCENT} />
        <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 2px" }}>클릭(코스·추천·배너)</div>
        <Bars values={r.daily.map((d) => d.clicks)} labels={r.daily.map((d, i) => (i % 5 === 0 ? d.day.slice(5).replace("-", "/") : ""))} color={BLUE} height={90} />
      </section>

      {/* 6. 요일별 관심 */}
      <section style={sectionStyle}>
        <h2 style={h2}>6. 요일별 관심(최근 60일 상세 조회)</h2>
        <Bars values={r.weekday} labels={WEEK} color="#5C7A4A" height={100} />
        <div style={note}>{Math.max(...r.weekday) > 0 ? `${WEEK[bestWeekday]}요일에 가장 많이 조회됐습니다. 이 요일 전날에 공지·이벤트를 올리면 효과적입니다.` : "아직 요일별 기록이 충분하지 않습니다."}</div>
      </section>

      {/* 7. 고객 반응 */}
      <section style={sectionStyle}>
        <h2 style={h2}>7. 고객 반응</h2>
        <table style={table}>
          <tbody>
            <tr><td style={tdS}>찜(누적)</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(r.reactions.bookmarks)}</td></tr>
            <tr><td style={tdS}>추천(누적)</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(r.reactions.likes)}</td></tr>
            <tr><td style={tdS}>후기(누적 / 최근 30일)</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(r.reviews.total)} / {n(r.reviews.last30)}</td></tr>
            <tr><td style={tdS}>사장님 답글률</td><td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{r.reviewReplyRate == null ? "-" : `${r.reviewReplyRate}% (${r.reviews.replied}/${r.reviews.total})`}</td></tr>
          </tbody>
        </table>
      </section>

      {/* 8. 개선 제안 */}
      <section style={sectionStyle}>
        <h2 style={h2}>8. 개선 제안</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>{r.insights.suggestions.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>

      {/* 9. 집계 기준 */}
      <section style={sectionStyle}>
        <h2 style={h2}>9. 집계 기준 및 유의사항</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: SUB, lineHeight: 1.8 }}>
          <li>같이가개 이용 기록(익명)을 기준으로 집계했으며, 개인을 알아볼 수 있는 정보는 포함하지 않습니다.</li>
          <li>같은 사람이 여러 번 보면 여러 번 세는 횟수 기준입니다. 실제 매장 방문·매출과는 차이가 있을 수 있습니다.</li>
          <li>무료 이용 기간 비교는 기간 길이를 30일로 환산한 값이며, 계절·행사 등 외부 요인이 함께 반영될 수 있습니다.</li>
          <li>비슷한 무료 업체 평균은 같은 업종의 무료 업체를 지역 범위(시·군·구 → 시·도 → 전국)를 넓혀 가며 최대 50곳까지 골라 계산했습니다.</li>
          <li>기록 시작일: {dot(r.trackingSince)}. 길찾기·전화·홈페이지 횟수는 2026년 10월 5일부터 집계됐습니다.</li>
        </ul>
      </section>
    </div>
  );
}
