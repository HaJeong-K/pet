"use client";

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { Download } from "lucide-react";

// ── 사업 성과 지표 ──
// 지원사업 중간·최종 보고에 바로 쓸 수 있도록 월별 지표와 누적 현황을 한 화면에 모으고,
// 엑셀에서 바로 열리는 CSV로 내려받을 수 있게 합니다. 집계는 DB 함수(kpi_monthly)가 합니다.

type Monthly = {
  month: string; signups: number; active_users: number; page_views: number; place_views: number;
  searches: number; course_views: number; course_directions: number; bookmarks: number; tips: number;
  tips_approved: number; reviews: number; community_posts: number; community_comments: number; reports: number;
};
type Totals = {
  visitors: number; members: number; ownersVerified: number; registeredPlaces: number; publicPlaces: number; totalPlaces: number;
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
  // 연·월 직접 고르기(2026-11-07) — 기록이 처음 생긴 달부터만 받아 옵니다
  const [allMonthly, setAllMonthly] = useState<Monthly[]>([]);
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<string>("all"); // "all" 또는 "01"~"12"
  const [totals, setTotals] = useState<Totals | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  // 직접 등록된 장소 목록("등록 n곳"을 누르면 펼침)
  const [registered, setRegistered] = useState<{ id: number; name: string; category: string | null; address: string | null; created_at: string }[]>([]);
  const [showRegistered, setShowRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/kpi`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "불러오지 못했어요."); return; }
      const list: Monthly[] = json.monthly || [];
      setAllMonthly(list);
      // 처음에는 가장 최근 연도 전체
      setYear((y) => y || (list.length ? list[list.length - 1].month.slice(0, 4) : ""));
      setTotals(json.totals);
      setRegistered(json.registeredList || []);
      setGeneratedAt(json.generatedAt);
    } catch {
      setError("불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const years = [...new Set(allMonthly.map((r) => r.month.slice(0, 4)))];
  const monthsOfYear = allMonthly.filter((r) => r.month.startsWith(year)).map((r) => r.month.slice(5, 7));
  const monthly = allMonthly.filter((r) => r.month.startsWith(year) && (month === "all" || r.month.slice(5, 7) === month));
  const periodLabel = month === "all" ? `${year}년 전체` : `${year}년 ${Number(month)}월`;

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
    rows.push([`합계(${periodLabel})`, ...COLUMNS.map((c) => String(sums[c.key]))]);
    const summary = totals
      ? [
          [],
          ["누적 현황", generatedAt.slice(0, 10)],
          ["전체 이용자 수(회원·비회원)", String(totals.visitors)],
          ["가입 회원", String(totals.members)],
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
    a.download = `펫츠로드_성과지표_${periodLabel.replace(/\s/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cards = totals
    ? [
        { label: "전체 이용자 수", value: totals.visitors, sub: "한 번이라도 방문한 회원·비회원(중복 제거)" },
        { label: "가입 회원", value: totals.members },
        { label: "인증된 사장님", value: totals.ownersVerified },
        { label: "지도 장소", value: totals.totalPlaces, sub: `등록 ${fmt(totals.registeredPlaces)}곳 · 공공 ${fmt(totals.publicPlaces)}곳`, onClick: () => setShowRegistered((v) => !v), hint: showRegistered ? "등록 장소 접기 ▴" : "등록 장소 보기 ▾" },
        { label: "진행 중 프리미엄", value: totals.premiumActive },
        { label: "전체 후기", value: totals.reviews },
        { label: "커뮤니티 글", value: totals.communityPosts },
      ]
    : [];

  return (
    <div>
      <AdminNav active="kpi" onRefresh={() => load()} />

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#5c5c5c" }}>지원사업 보고용 · 한국 시간 기준 월별 집계</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={year} onChange={(e) => { setYear(e.target.value); setMonth("all"); }} aria-label="연도" style={sel}>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="월" style={sel}>
              <option value="all">전체 달</option>
              {monthsOfYear.map((m) => <option key={m} value={m}>{Number(m)}월</option>)}
            </select>
            <button onClick={downloadCsv} disabled={monthly.length === 0} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999,
              border: "1px solid #ECCAB3", background: "white", color: "#85482A", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
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
            {cards.map((c) => {
              const inner = (
                <>
                  <div style={{ fontSize: 12, color: "#5c5c5c", fontWeight: 600 }}>{c.label}</div>
                  <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#222", marginTop: 4 }}>{fmt(c.value)}</div>
                  {c.sub && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{c.sub}</div>}
                  {"hint" in c && c.hint && <div style={{ fontSize: 11.5, color: "#A05A32", fontWeight: 800, marginTop: 6 }}>{c.hint}</div>}
                </>
              );
              const box: React.CSSProperties = { background: "white", borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(0,0,0,0.05)", textAlign: "left", fontFamily: "inherit" };
              return "onClick" in c && c.onClick
                ? <button key={c.label} type="button" onClick={c.onClick} aria-expanded={showRegistered} style={{ ...box, cursor: "pointer", border: showRegistered ? "1px solid #D9C2B2" : box.border }}>{inner}</button>
                : <div key={c.label} style={box}>{inner}</div>;
            })}
          </div>
        )}

        {/* 직접 등록된 장소 — 사장님 등록·제보 승인·관리자 추가로 펫츠로드 DB에 들어온 곳(공공데이터 장소는 빠짐) */}
        {showRegistered && (
          <div style={{ background: "white", borderRadius: 14, border: "1px solid #E7E1DC", padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>등록 장소 {fmt(registered.length)}곳</div>
            <div style={{ fontSize: 12, color: "#4A3F38", marginTop: 4, lineHeight: 1.6 }}>
              사장님이 직접 등록했거나, 제보가 승인됐거나, 관리자가 추가해 펫츠로드에 따로 저장된 장소예요.<br />
              정보가 한 가지라도 있다고 등록으로 세지 않아요. 관광공사 등 공공데이터에서 받아 온 장소는 &quot;공공&quot;으로 따로 세요.
            </div>
            {registered.length === 0 ? (
              <div style={{ fontSize: 13, color: "#4A3F38", marginTop: 10 }}>아직 등록된 장소가 없어요.</div>
            ) : (
              <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                {registered.map((p) => (
                  <a key={p.id} href={`/place/${p.id}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #EEE", textDecoration: "none", color: "inherit" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222" }}>{p.name}{p.category ? <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 600, color: "#85482A" }}>{p.category}</span> : null}</div>
                      <div style={{ fontSize: 12, color: "#5c5c5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.address || "주소 없음"}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: "#666", flexShrink: 0 }}>{p.created_at?.slice(0, 10)} 등록</span>
                    <span style={{ fontSize: 11, color: "#6e6e6e", flexShrink: 0 }}>#{p.id} ↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5c5c5c", fontSize: 13 }}><LogoLoader /></div>
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
        <p style={{ fontSize: 11.5, color: "#666", marginTop: 10, lineHeight: 1.6 }}>
          · 기록이 처음 생긴 달부터 보여요. 연도와 달을 골라 볼 수 있어요.
          <br />· 활성 사용자는 그달에 한 번 이상 방문한 회원·비회원 수(중복 제거)이고, 합계 칸은 가장 많았던 달의 값이에요.
          <br />· 신규 가입·가입 회원은 실제 로그인 계정 기준이에요(예전 비회원 기록은 빼고 셉니다).
          <br />· 지도 장소의 공공데이터 수는 매일 새벽 자동 갱신돼요.
        </p>
      </div>
    </div>
  );
}

const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, border: "1px solid #E3DED9", background: "white", fontSize: 12.5, fontWeight: 700, color: "#3B2A20", fontFamily: "inherit", cursor: "pointer" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#555", fontSize: 12 };
const td: React.CSSProperties = { padding: "9px 12px", textAlign: "right", color: "#333" };
