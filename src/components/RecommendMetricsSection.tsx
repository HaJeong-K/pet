"use client";

// /admin/analytics 하단 "추천 성과" 섹션 — /api/admin/recommend-metrics 집계를 A/B 그룹별로 보여줍니다.
// v1 = 기존 규칙 기반 추천, v2 = 신규 추천(품질·개인화·다양성·광고 분리). 롤아웃 비율은
// 환경변수 NEXT_PUBLIC_REC_V2_ROLLOUT으로 조절합니다(experiment.ts 참고).

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sparkles, Route as RouteIcon } from "lucide-react";

type VariantMetrics = {
  variant: string;
  rec: {
    impressions: number;
    users: number;
    clicks: number;
    ctr: number;
    adImpressions: number;
    adClicks: number;
    adCtr: number;
    bookmarkConversions: number;
    bookmarkConversionRate: number;
    positionClicks: { pos: number; clicks: number }[];
  };
  course: {
    impressions: number;
    users: number;
    regenerates: number;
    regenerateRate: number;
    stopClicks: number;
    starts: number;
    startRate: number;
    tmapShare: number;
  };
};

const VARIANT_LABEL: Record<string, string> = {
  v1: "v1 · 기존 규칙",
  v2: "v2 · 신규 추천",
  unknown: "그룹 미기록",
  all: "",
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * 그룹별 집계를 하나로 합칩니다.
 * 지금은 모든 방문자가 같은 추천(v2)을 쓰므로 그룹을 나눠 볼 이유가 없습니다 — "그룹 미기록"(그룹 표시 없이 남은 기록)과
 * "v2"가 따로 보여 헷갈리기만 했습니다. 기존 규칙(v1)과 비교 실험을 켰을 때만 그룹별로 나눠 보여 줍니다.
 */
function mergeVariants(rows: VariantMetrics[]): VariantMetrics {
  const sum = (pick: (r: VariantMetrics) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const impressions = sum((r) => r.rec.impressions), clicks = sum((r) => r.rec.clicks);
  const adImpressions = sum((r) => r.rec.adImpressions), adClicks = sum((r) => r.rec.adClicks);
  const bookmarkConversions = sum((r) => r.rec.bookmarkConversions);
  const positions = new Map<number, number>();
  for (const r of rows) for (const p of r.rec.positionClicks) positions.set(p.pos, (positions.get(p.pos) || 0) + p.clicks);
  const courseImpressions = sum((r) => r.course.impressions), regenerates = sum((r) => r.course.regenerates), starts = sum((r) => r.course.starts);
  return {
    variant: "all",
    rec: {
      impressions, users: sum((r) => r.rec.users), clicks, ctr: pct(clicks, impressions),
      adImpressions, adClicks, adCtr: pct(adClicks, adImpressions),
      bookmarkConversions, bookmarkConversionRate: pct(bookmarkConversions, clicks),
      positionClicks: [...positions.entries()].sort((a, b) => a[0] - b[0]).map(([pos, c]) => ({ pos, clicks: c })),
    },
    course: {
      impressions: courseImpressions, users: sum((r) => r.course.users), regenerates, regenerateRate: pct(regenerates, courseImpressions),
      stopClicks: sum((r) => r.course.stopClicks), starts, startRate: pct(starts, courseImpressions),
      // 그룹별 비율을 코스 노출 수로 가중 평균
      tmapShare: courseImpressions > 0 ? Math.round(sum((r) => r.course.tmapShare * r.course.impressions) / courseImpressions * 10) / 10 : 0,
    },
  };
}

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  padding: 18,
};

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "#999", fontWeight: 700 }}>{label}</div>
      <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 700, color: "#111", marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

function PositionBars({ data }: { data: { pos: number; clicks: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.clicks));
  return (
    // 높이 = 수치(12) + 막대(최대 40) + 순위(12) + 간격 — 예전엔 칸(56px)이 내용보다 낮아 가장 높은 막대의 수치가 위쪽 제목과 겹쳤습니다.
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 76, marginTop: 6 }}>
      {data.map((d) => (
        <div key={d.pos} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, lineHeight: "12px", color: "#999", fontWeight: 700 }}>{d.clicks}</span>
          <div style={{ width: "100%", height: `${(d.clicks / max) * 40}px`, minHeight: 2, flexShrink: 0, background: "#8FA876", borderRadius: 3 }} />
          <span style={{ fontSize: 9, lineHeight: "12px", color: "#bbb" }}>{d.pos}</span>
        </div>
      ))}
    </div>
  );
}

export default function RecommendMetricsSection() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<VariantMetrics[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelled) return;
      setLoading(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/recommend-metrics?days=${days}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setMessage(json.error);
          setRows(null);
          return;
        }
        // 기존 규칙(v1) 기록이 있을 때만(비교 실험 중) 그룹별로, 아니면 하나로 합쳐 보여 줍니다.
        const list: VariantMetrics[] = json.byVariant || [];
        const comparing = list.some((r) => r.variant === "v1" && (r.rec.impressions > 0 || r.course.impressions > 0));
        setRows(comparing || list.length <= 1 ? list : [mergeVariants(list)]);
      } catch {
        if (!cancelled) setMessage("추천 성과를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
          추천 성과{rows && rows.length > 1 ? " (비교 실험 그룹별)" : ""}
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #ddd", fontSize: 11.5 }}
        >
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>최근 {d}일</option>)}
        </select>
      </div>

      {message && (
        <div style={{ ...cardStyle, fontSize: 12, color: "#8a6d2b", background: "#fffaf0" }}>{message}</div>
      )}
      {!message && loading && !rows && (
        <div style={{ ...cardStyle, fontSize: 12, color: "#999" }}><LogoLoader /></div>
      )}
      {!message && rows && rows.length === 0 && (
        <div style={{ ...cardStyle, fontSize: 12, color: "#aaa" }}>아직 추천 노출 기록이 없습니다.</div>
      )}

      {!message && rows && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 16 }}>
          {rows.map((r) => (
            <div key={r.variant} style={cardStyle}>
              {rows.length > 1 && (
                <div style={{ fontSize: 12, fontWeight: 800, color: "#48603A", marginBottom: 12 }}>
                  {VARIANT_LABEL[r.variant] ?? r.variant}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 8 }}>
                <Sparkles size={13} color="#5C7A4A" /> 추천 장소
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
                <Metric label="노출(목록)" value={r.rec.impressions} hint={`${r.rec.users}명`} />
                <Metric label="클릭률" value={`${r.rec.ctr}%`} hint={`클릭 ${r.rec.clicks}`} />
                <Metric label="찜 전환율" value={`${r.rec.bookmarkConversionRate}%`} hint="클릭 후 24시간" />
                <Metric label="광고 클릭률" value={`${r.rec.adCtr}%`} hint={`노출 ${r.rec.adImpressions}`} />
              </div>
              <div style={{ fontSize: 10.5, color: "#999", fontWeight: 700, marginBottom: 4 }}>순위별 클릭 수</div>
              <PositionBars data={r.rec.positionClicks} />

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#333", margin: "16px 0 8px" }}>
                <RouteIcon size={13} color="#7c3aed" /> AI 코스
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
                <Metric label="코스 노출" value={r.course.impressions} hint={`${r.course.users}명`} />
                <Metric label="출발 전환율" value={`${r.course.startRate}%`} hint={`길찾기 ${r.course.starts}`} />
                <Metric label="다른 코스 요청률" value={`${r.course.regenerateRate}%`} hint="낮을수록 좋음" />
                <Metric label="실제 도보경로" value={`${r.course.tmapShare}%`} hint="TMAP 적용 비율" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
