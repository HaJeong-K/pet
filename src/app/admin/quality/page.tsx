"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { ShieldCheck, Play } from "lucide-react";
import type { QualityIssue, QualityReport } from "@/lib/server/dataQuality";

// ── 장소 데이터 품질 점검 ──
// 매주 자동 점검(화요일 새벽) 결과를 보여주고, "지금 점검"으로 바로 다시 돌릴 수 있습니다.
// 항목을 누르면 그 장소 상세 화면이 새 탭으로 열려 바로 고칠 수 있습니다.

const KIND_LABEL: Record<QualityIssue["kind"], { label: string; bg: string; color: string }> = {
  coords: { label: "좌표 문제", bg: "#fee2e2", color: "#b91c1c" },
  duplicate: { label: "중복 의심", bg: "#fef3c7", color: "#92400e" },
  broken_image: { label: "깨진 사진", bg: "#e0e7ff", color: "#3730a3" },
  missing_info: { label: "정보 부족", bg: "#f1f5f9", color: "#475569" },
};

async function call(method: "GET" | "POST") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/quality", { method, headers: { Authorization: `Bearer ${session.access_token}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "불러오지 못했어요.");
  return json.report as QualityReport | null;
}

export default function AdminQuality() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QualityIssue["kind"] | "all">("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setReport(await call("GET")); } catch (e) { setError(e instanceof Error ? e.message : "오류"); } finally { setLoading(false); }
  };
  const runNow = async () => {
    setRunning(true);
    setError(null);
    try { setReport(await call("POST")); } catch (e) { setError(e instanceof Error ? e.message : "오류"); } finally { setRunning(false); }
  };

  useEffect(() => { load(); }, []);

  const issues = (report?.issues || []).filter((i) => filter === "all" || i.kind === filter);

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="quality" onRefresh={load} />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <ShieldCheck size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>데이터 품질</div>
          <span style={{ fontSize: 12, color: "#888" }}>
            {report ? `마지막 점검 ${new Date(report.checkedAt).toLocaleString("ko-KR")} · 장소 ${report.placesChecked}곳 · 사진 ${report.imagesChecked}장` : "직접 등록·제보된 장소를 매주 자동 점검해요"}
          </span>
          <button onClick={runNow} disabled={running} style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 999,
            border: "none", background: running ? "#cbd5c0" : "#5C7A4A", color: "white", fontSize: 12, fontWeight: 700,
            cursor: running ? "default" : "pointer",
          }}>
            <Play size={12} /> {running ? "점검 중… (사진 확인에 시간이 걸려요)" : "지금 점검"}
          </button>
        </div>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 14 }}>{error}</div>}

        {report && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => setFilter("all")} style={chip(filter === "all")}>전체 {report.issues.length}</button>
            {(Object.keys(KIND_LABEL) as QualityIssue["kind"][]).map((k) => (
              <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>{KIND_LABEL[k].label} {report.counts[k]}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>불러오는 중...</div>
        ) : !report ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>아직 점검 기록이 없어요. &quot;지금 점검&quot;을 눌러 보세요.</div>
        ) : issues.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5C7A4A", fontSize: 13, fontWeight: 700 }}>문제가 발견되지 않았어요 👍</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {issues.map((i, idx) => (
              <a key={`${i.kind}-${i.placeId}-${idx}`} href={`/place/${i.placeId}`} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "white",
                border: "1px solid #eee", textDecoration: "none", color: "inherit",
              }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: KIND_LABEL[i.kind].bg, color: KIND_LABEL[i.kind].color, flexShrink: 0 }}>
                  {KIND_LABEL[i.kind].label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>{i.placeName}</span>
                <span style={{ fontSize: 12, color: "#777" }}>{i.detail}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa", flexShrink: 0 }}>#{i.placeId}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
  background: active ? "#5C7A4A" : "white", color: active ? "white" : "#555",
});
