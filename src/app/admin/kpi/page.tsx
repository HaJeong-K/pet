"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { TrendingUp, Download } from "lucide-react";

// ── 사업 성과 지표 ──
// 지원사업 중간·최종 보고에 바로 쓸 수 있도록 월별 지표와 누적 현황을 한 화면에 모으고,
// 엑셀에서 바로 열리는 CSV로 내려받을 수 있게 합니다. 집계는 DB 함수(kpi_monthly)가 합니다.

type Monthly = {
  month: string; signups: number; active_users: number; page_views: number; place_views: number;
  searches: number; course_views: number; course_directions: number; bookmarks: number; tips: number;
  tips_approved: number; reviews: number; community_posts: number; community_comments: number; reports: number;
};
type Totals = {
  members: number; ownersVerified: number; registeredPlaces: number; publicPlaces: number; totalPlaces: number;
  premiumActive: number; reviews: number; communityPosts: number;
};

const COLUMNS: { key: keyof Monthly; label: string }[] = [
  { key: "signups", label: "신규 가입" },
  { key: "active_users", label: "활성 사용자" },
  { key: "page_views", label: "페이지 조회" },
  { key: "place_views", label: "장소 조회" },
  { key: "searches", label: "검색" },
  { key: "course_views", label: "AI 코스 노출" },
  { key: "course_directions", label: "코스 길찾기" },
  { key: "bookmarks", label: "찜" },
  { key: "tips", label: "제보" },
  { key: "tips_approved", label: "제보 등록" },
  { key: "reviews", label: "후기" },
  { key: "community_posts", label: "커뮤니티 글" },
  { key: "community_comments", label: "커뮤니티 댓글" },
  { key: "reports", label: "신고" },
];

const fmt = (n: number) => Number(n || 0).toLocaleString("ko-KR");

export default function AdminKpi() {
  const [months, setMonths] = useState(12);
  const [monthly, setMonthly] = useState<Monthly[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (m = months) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/kpi?months=${m}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "불러오지 못했어요."); return; }
      setMonthly(json.monthly || []);
      setTotals(json.totals);
      setGeneratedAt(json.generatedAt);
    } catch {
      setError("불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(months); }, [months]);

  const sums = COLUMNS.reduce((acc, c) => {
    // 활성 사용자는 월마다 같은 사람이 겹쳐서 합계가 의미 없으므로 월 최댓값을 보여줍니다.
    acc[c.key] = c.key === "active_users"
      ? Math.max(0, ...monthly.map((r) => Number(r.active_users) || 0))
      : monthly.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return acc;
  }, {} as Record<string, number>);

  const downloadCsv = () => {
    const head = ["월", ...COLUMNS.map((c) => c.label)];
    const rows = monthly.map((r) => [r.month, ...COLUMNS.map((c) => String(r[c.key] ?? 0))]);
    rows.push([`합계(${months}개월)`, ...COLUMNS.map((c) => String(sums[c.key]))]);
    const summary = totals
      ? [
          [],
          ["누적 현황", generatedAt.slice(0, 10)],
          ["전체 회원", String(totals.members)],
          ["인증된 사장님", String(totals.ownersVerified)],
          ["지도 장소(전체)", String(totals.totalPlaces)],
          ["  직접 등록·제보", String(totals.registeredPlaces)],
          ["  공공데이터", String(totals.publicPlaces)],
          ["진행 중 프리미엄", String(totals.premiumActive)],
          ["전체 후기", String(totals.reviews)],
          ["전체 커뮤니티 글", String(totals.communityPosts)],
        ]
      : [];
    const csv = [head, ...rows, ...summary]
      .map((line) => line.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // 엑셀이 한글을 깨뜨리지 않도록 UTF-8 BOM을 붙입니다.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `같이가개_성과지표_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cards = totals
    ? [
        { label: "전체 회원", value: totals.members },
        { label: "인증된 사장님", value: totals.ownersVerified },
        { label: "지도 장소", value: totals.totalPlaces, sub: `등록 ${fmt(totals.registeredPlaces)} · 공공 ${fmt(totals.publicPlaces)}` },
        { label: "진행 중 프리미엄", value: totals.premiumActive },
        { label: "전체 후기", value: totals.reviews },
        { label: "커뮤니티 글", value: totals.communityPosts },
      ]
    : [];

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="kpi" onRefresh={() => load(months)} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) 120px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <TrendingUp size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>성과 지표</div>
          <span style={{ fontSize: 12, color: "#888" }}>지원사업 보고용 · 한국 시간 기준 월별 집계</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {[6, 12, 24].map((m) => (
              <button key={m} onClick={() => setMonths(m)} style={{
                padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: months === m ? "#5C7A4A" : "white", color: months === m ? "white" : "#555",
              }}>
                최근 {m}개월
              </button>
            ))}
            <button onClick={downloadCsv} disabled={monthly.length === 0} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999,
              border: "1px solid #cfdcc3", background: "white", color: "#48603A", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              cursor: monthly.length === 0 ? "default" : "pointer",
            }}>
              <Download size={13} /> 엑셀(CSV) 내려받기
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {cards.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 18 }}>
            {cards.map((c) => (
              <div key={c.label} style={{ background: "white", borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{c.label}</div>
                <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#222", marginTop: 4 }}>{fmt(c.value)}</div>
                {c.sub && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{c.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>불러오는 중...</div>
        ) : monthly.length > 0 && (
          <div style={{ background: "white", borderRadius: 14, border: "1px solid rgba(0,0,0,0.05)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ background: "#f8f7f2" }}>
                  <th style={th}>월</th>
                  {COLUMNS.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...monthly].reverse().map((r) => (
                  <tr key={r.month} style={{ borderTop: "1px solid #f1f1f1" }}>
                    <td style={{ ...td, fontWeight: 700, textAlign: "left" }}>{r.month}</td>
                    {COLUMNS.map((c) => <td key={c.key} style={td}>{fmt(Number(r[c.key]))}</td>)}
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #e5e7eb", background: "#fafaf7" }}>
                  <td style={{ ...td, fontWeight: 800, textAlign: "left" }}>합계</td>
                  {COLUMNS.map((c) => <td key={c.key} style={{ ...td, fontWeight: 800 }}>{fmt(sums[c.key])}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: "#999", marginTop: 10, lineHeight: 1.6 }}>
          · 활성 사용자는 그달에 한 번 이상 방문한 회원·비회원 수(중복 제거)이고, 합계 칸은 가장 많았던 달의 값이에요.
          <br />· 지도 장소의 공공데이터 수는 매일 새벽 자동 갱신돼요.
        </p>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#555", fontSize: 12 };
const td: React.CSSProperties = { padding: "9px 12px", textAlign: "right", color: "#333" };
