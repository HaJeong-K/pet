"use client";

// 사장님 "성과 보고서" 상세판 — 화면에는 보이지 않고, "인쇄 · PDF 저장"을 누르면 이 보고서가 A4로 인쇄됩니다.
// 일반적인 마케팅 성과 보고서 순서:
//   표지 → 1. 요약(핵심 지표·주요 성과) → 2. 기간 비교 → 3. 유료 이용 효과(무료 이용 대비 / 비슷한 무료 업체 대비)
//   → 4. 고객 여정(노출→클릭→조회→행동) → 5. 일별 추이 → 6. 요일별 관심 → 7. 고객 반응 → 8. 개선 제안 → 9. 집계 기준
// 데이터는 /api/owner/report, 계산 규칙은 src/lib/ownerReport.ts.

import { changeText, METRICS, ratio, totals, type Metrics, type MetricKey } from "@/lib/ownerReport";
import { PLAN_MONTHLY_PRICE, won, type PaidPlanId } from "@/lib/ownerPlans";

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

/** 막대 그래프 — 막대 위에 정확한 수치를 함께 적습니다. 평균선(점선)도 그립니다. 인쇄해도 글자가 늘어나지 않게 SVG 대신 상자로 그립니다 */
function Bars({ values, labels, color, height = 110 }: { values: number[]; labels: string[]; color: string; height?: number }) {
  const max = Math.max(1, ...values);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const many = values.length > 14;
  return (
    <div role="img" aria-label="막대 그래프">
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: height + 16, borderBottom: `1px solid ${LINE}` }}>
        {avg > 0 && <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: (avg / max) * height, borderTop: `1px dashed ${SUB}` }}><span style={{ position: "absolute", right: 0, top: -14, fontSize: 9.5, color: SUB, background: "white", padding: "0 3px" }}>평균 {n(Math.round(avg * 10) / 10)}</span></div>}
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: many ? 8.5 : 11, fontWeight: 800, color: v > 0 ? INK : SUB, lineHeight: 1.1, marginBottom: 2 }}>{v}</span>
            <div title={`${labels[i] || ""} ${v}`} style={{ width: "100%", height: Math.max((v / max) * height, v > 0 ? 3 : 1), background: v > 0 ? color : LINE, borderRadius: "2px 2px 0 0", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
          </div>
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

/** screen: 화면에 바로 보여 줄 때(표지 없이). 인쇄할 때는 표지부터 */
export default function OwnerDetailedReport({ r, screen = false }: { r: DetailedReport; screen?: boolean }) {
  const cur = totals(r.current), prev = totals(r.previous);
  // ── 투자 대비 효과(유료 요금제일 때) — 한 달 요금으로 얻은 조회·행동, 1건당 비용 ──
  const price = r.plan ? PLAN_MONTHLY_PRICE[r.plan.id as PaidPlanId] ?? 0 : 0;
  const base = r.beforePaid ? totals(r.beforePaid.metrics) : null;
  const peer = r.peers ? totals(r.peers.metrics) : null;
  const per = (v: number) => (price > 0 && v > 0 ? won(Math.round(price / v)) : "-");
  const times = (a: number, b: number) => (b > 0 ? `${(a / b).toFixed(1)}배` : a > 0 ? "새로 생김" : "-");
  // ── 최근 7일 vs 그 전 7일(일별 기록에서) ──
  const sum = (arr: { views: number; clicks: number }[], k: "views" | "clicks") => arr.reduce((a, d) => a + d[k], 0);
  const last7 = r.daily.slice(-7), prev7 = r.daily.slice(-14, -7);
  const dayAvg = (v: number) => n(Math.round((v / 30) * 10) / 10);
  const bestDay = [...r.daily].sort((a, b) => b.views - a.views)[0];
  const kpis: [string, number, number][] = [["노출", cur.exposure, prev.exposure], ["클릭", cur.clicks, prev.clicks], ["상세 조회", cur.views, prev.views], ["방문·문의 행동", cur.actions, prev.actions]];
  const funnel: [string, number][] = [["노출(코스·추천·배너)", cur.exposure], ["클릭", cur.clicks], ["상세 조회", cur.views], ["방문·문의 행동", cur.actions]];
  const funnelMax = Math.max(1, ...funnel.map(([, v]) => v));
  const bestWeekday = r.weekday.indexOf(Math.max(...r.weekday));
  const generated = new Date(r.generatedAt);

  return (
    <div style={{ color: INK, fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif", fontSize: 12.5, lineHeight: 1.6, wordBreak: "keep-all" }}>
      {/* 표지 — 인쇄할 때만 */}
      {!screen && <div style={{ minHeight: "250mm", display: "flex", flexDirection: "column", justifyContent: "space-between", breakAfter: "page", padding: "20mm 6mm 10mm" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>펫츠로드 · 반려동물 동반 장소 플랫폼</div>
          <div style={{ fontSize: 32, fontWeight: 900, marginTop: 18, lineHeight: 1.3 }}>마케팅 성과 보고서</div>
          <div style={{ fontSize: 15, color: SUB, marginTop: 8 }}>노출 · 클릭 · 방문 전환 분석과 개선 제안</div>
        </div>
        <div style={{ borderTop: `3px solid ${ACCENT}`, paddingTop: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{r.place.name}</div>
          <table style={{ ...table, marginTop: 12, fontSize: 13 }}>
            <tbody>
              {[["업종", r.place.category ?? "-"], ["주소", r.place.address ?? "-"], ["분석 기간", `${dot(r.period.from)} ~ ${dot(r.period.to)} (30일)`],
                ["이용 요금제", r.plan ? `${r.plan.name}${r.paidSince ? ` (${dot(r.paidSince.slice(0, 10))} 시작)` : ""}` : "무료 이용"],
                ["작성일", generated.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })], ["발행", "펫츠로드"]].map(([k, v]) => (
                <tr key={k}><td style={{ padding: "5px 0", width: 110, color: SUB }}>{k}</td><td style={{ padding: "5px 0", fontWeight: 700 }}>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* 1. 요약 */}
      <section style={{ breakInside: "avoid" }}>
        <h2 style={h2}>1. 요약</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {kpis.map(([k, v, p]) => (
            <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 10px" }}>
              <div style={{ fontSize: 11, color: SUB, fontWeight: 700 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{n(v)}</div>
              <div style={{ fontSize: 11, color: v >= p ? "#15803D" : "#B91C1C", fontWeight: 700 }}>직전 30일 {n(p)} → {changeText(v, p)}</div>
              <div style={{ fontSize: 11, color: SUB }}>하루 평균 {dayAvg(v)}</div>
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

      {/* 투자 대비 효과 — 돈을 쓴 만큼 무엇을 얻었는지 한눈에 */}
      <section style={sectionStyle}>
        <h2 style={h2}>한눈에 보는 투자 대비 효과</h2>
        {price > 0 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {[
                ["한 달 요금", won(price), r.plan?.name ?? ""],
                ["상세 조회 1회당", per(cur.views), `${n(cur.views)}회 조회`],
                ["방문·문의 행동 1건당", per(cur.actions), `길찾기·전화·홈페이지 ${n(cur.actions)}건`],
                ["노출 1회당", per(cur.exposure), `${n(cur.exposure)}회 노출`],
              ].map(([k, v, sub]) => (
                <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 11px", background: "#FFFBF5" }}>
                  <div style={{ fontSize: 11, color: SUB, fontWeight: 700 }}>{k}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT }}>{v}</div>
                  <div style={{ fontSize: 11, color: SUB }}>{sub}</div>
                </div>
              ))}
            </div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
              {base && <li>무료로 이용하던 때(30일 환산)보다 상세 조회가 <b>{times(cur.views, base.views)}</b>({n(base.views)} → {n(cur.views)}회), 방문·문의 행동이 <b>{times(cur.actions, base.actions)}</b>({n(base.actions)} → {n(cur.actions)}건)예요.{cur.views - base.views > 0 && <> 늘어난 조회 {n(cur.views - base.views)}회를 1회당 <b>{won(Math.round(price / (cur.views - base.views)))}</b>에 얻은 셈이에요.</>}</li>}
              {peer && <li>비슷한 무료 업체 평균보다 상세 조회 <b>{times(cur.views, peer.views)}</b>({n(peer.views)} → {n(cur.views)}회), 노출 <b>{times(cur.exposure, peer.exposure)}</b>({n(peer.exposure)} → {n(cur.exposure)}회)예요.</li>}
              <li>하루 평균 {dayAvg(cur.exposure)}번 손님 화면에 보였고, {dayAvg(cur.views)}번 상세 화면이 열렸어요. 하루 요금으로 치면 약 {won(Math.round(price / 30))}이에요.</li>
            </ul>
          </>
        ) : (
          <div style={{ color: SUB }}>지금은 무료로 이용 중이에요. 유료 요금제를 시작하면 요금 대비 조회·행동 1건당 비용과 무료 이용 때와의 차이를 여기서 보여 드려요.
            {peer && <> 참고로 비슷한 무료 업체 평균 대비 상세 조회는 {times(cur.views, peer.views)}예요.</>}</div>
        )}
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
        {r.daily.length >= 14 && (
          <table style={{ ...table, marginTop: 12 }}>
            <thead><tr><th style={thS}>최근 7일 vs 그 전 7일</th><th style={{ ...thS, textAlign: "right" }}>최근 7일</th><th style={{ ...thS, textAlign: "right" }}>그 전 7일</th><th style={{ ...thS, textAlign: "right" }}>증감</th></tr></thead>
            <tbody>
              {(["views", "clicks"] as const).map((k) => (
                <tr key={k}>
                  <td style={{ ...tdS, fontWeight: 700 }}>{k === "views" ? "상세 조회" : "클릭"}</td>
                  <td style={{ ...tdS, textAlign: "right", fontWeight: 800 }}>{n(sum(last7, k))}</td>
                  <td style={{ ...tdS, textAlign: "right" }}>{n(sum(prev7, k))}</td>
                  <td style={{ ...tdS, textAlign: "right", fontWeight: 700, color: sum(last7, k) >= sum(prev7, k) ? "#15803D" : "#B91C1C" }}>{changeText(sum(last7, k), sum(prev7, k))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 3. 유료 이용 효과 */}
      <section style={{ ...sectionStyle, breakBefore: screen ? undefined : "page" }}>
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
              <span style={{ textAlign: "right", fontWeight: 800 }}>{n(v)}회{i > 0 && <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: SUB }}>앞 단계의 {pct(ratio(v, funnel[i - 1][1]))}</span>}</span>
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
      <section style={{ ...sectionStyle, breakBefore: screen ? undefined : "page" }}>
        <h2 style={h2}>5. 일별 추이(최근 30일)</h2>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>상세 조회</div>
        <Bars values={r.daily.map((d) => d.views)} labels={r.daily.map((d, i) => (i % 5 === 0 ? d.day.slice(5).replace("-", "/") : ""))} color={ACCENT} />
        <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 2px" }}>클릭(코스·추천·배너)</div>
        <Bars values={r.daily.map((d) => d.clicks)} labels={r.daily.map((d, i) => (i % 5 === 0 ? d.day.slice(5).replace("-", "/") : ""))} color={BLUE} height={90} />
        <div style={note}>30일 합계 상세 조회 {n(r.daily.reduce((a, d) => a + d.views, 0))}회 · 클릭 {n(r.daily.reduce((a, d) => a + d.clicks, 0))}회{bestDay && bestDay.views > 0 ? ` · 가장 많이 본 날 ${bestDay.day.slice(5).replace("-", "월 ")}일(${bestDay.views}회)` : ""}. 점선은 하루 평균이에요.</div>
      </section>

      {/* 6. 요일별 관심 */}
      <section style={sectionStyle}>
        <h2 style={h2}>6. 요일별 관심(최근 60일 상세 조회)</h2>
        <Bars values={r.weekday} labels={WEEK} color="#A05A32" height={100} />
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
          <li>펫츠로드 이용 기록(익명)을 기준으로 집계했으며, 개인을 알아볼 수 있는 정보는 포함하지 않습니다.</li>
          <li>같은 사람이 여러 번 보면 여러 번 세는 횟수 기준입니다. 실제 매장 방문·매출과는 차이가 있을 수 있습니다.</li>
          <li>무료 이용 기간 비교는 기간 길이를 30일로 환산한 값이며, 계절·행사 등 외부 요인이 함께 반영될 수 있습니다.</li>
          <li>비슷한 무료 업체 평균은 같은 업종의 무료 업체를 지역 범위(시·군·구 → 시·도 → 전국)를 넓혀 가며 최대 50곳까지 골라 계산했습니다.</li>
          <li>기록 시작일: {dot(r.trackingSince)}. 길찾기·전화·홈페이지 횟수는 2026년 10월 5일부터 집계됐습니다.</li>
        </ul>
      </section>
    </div>
  );
}
