"use client";

// /admin/analytics 하단 "추천 성과" 섹션 — /api/admin/recommend-metrics 집계를 A/B 그룹별로 보여줍니다.
// v1 = 기존 규칙 기반 추천, v2 = 신규 추천(품질·개인화·다양성·광고 분리). 롤아웃 비율은
// 환경변수 NEXT_PUBLIC_REC_V2_ROLLOUT으로 조절합니다(experiment.ts 참고).

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
};

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
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
      {data.map((d) => (
        <div key={d.pos} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 9, color: "#999", fontWeight: 700 }}>{d.clicks}</span>
          <div style={{ width: "100%", height: `${(d.clicks / max) * 36}px`, minHeight: 2, background: "#8FA876", borderRadius: 3 }} />
          <span style={{ fontSize: 9, color: "#bbb" }}>{d.pos}</span>
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
        setRows(json.byVariant);
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
          추천 성과 (A/B 그룹별)
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
        <div style={{ ...cardStyle, fontSize: 12, color: "#999" }}>불러오는 중...</div>
      )}
      {!message && rows && rows.length === 0 && (
        <div style={{ ...cardStyle, fontSize: 12, color: "#aaa" }}>아직 추천 노출 기록이 없습니다.</div>
      )}

      {!message && rows && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(rows.length, 2)}, minmax(0, 1fr))`, gap: 16 }}>
          {rows.map((r) => (
            <div key={r.variant} style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#48603A", marginBottom: 12 }}>
                {VARIANT_LABEL[r.variant] ?? r.variant}
              </div>

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
