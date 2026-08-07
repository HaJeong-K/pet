"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { Users, TrendingUp, Search, MapPin, Repeat, UserCheck, RotateCcw } from "lucide-react";

type AnalyticsData = {
  totals: {
    members: number;
    guests: number;
    dau: number;
    wau: number;
    mau: number;
    retentionRate: number;
    guestVisitorRate: number;
  };
  trendFrom: string;
  trendTo: string;
  signupsTrend: { date: string; count: number }[];
  dailyVisitorsTrend: { date: string; count: number }[];
  topSearches: { query: string; count: number }[];
  topPlaces: { placeName: string; region: string; subRegion: string; count: number }[];
  availableSubRegions: string[];
};

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  padding: 18,
};

const fmtDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => toISODate(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={14} color="#48603A" />
        </div>
        <span style={{ fontSize: 11.5, color: "#888", fontWeight: 700 }}>{label}</span>
      </div>
      <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarTrend({ data, color = "#5C7A4A" }: { data: { date: string; count: number }[]; color?: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    // ⚠ 처음엔 마우스를 올려야만(호버 툴팁) 수치가 보이는 방식으로 만들었는데,
    // 가로 스크롤이 있는 상태에서 맨 끝 막대는 마우스를 올리는 것 자체가 스크롤과
    // 겹쳐서 사실상 수치를 확인할 수 없었습니다. 그래서 호버/스크롤과 무관하게
    // 막대 "위에 수치를 항상" 작게 표시하는 방식으로 바꿨습니다 — 스크롤 여부와
    // 상관없이 보이는 모든 막대의 수치를 바로 읽을 수 있습니다.
    <div style={{ display: "flex", alignItems: "flex-end", gap: Math.max(2, 6 - Math.floor(data.length / 10)), height: 120, overflowX: "scroll" }}>
      {data.map((d, i) => (
        <div
          key={d.date}
          style={{ flex: "1 0 auto", minWidth: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
        >
          <span style={{
            fontSize: 9, fontWeight: 700, lineHeight: "12px",
            color: hoverIdx === i ? "#111" : "#999",
          }}>
            {d.count}
          </span>
          <div
            style={{
              width: "100%",
              height: Math.max(3, (d.count / max) * 78),
              background: hoverIdx === i ? "#48603A" : color,
              borderRadius: 4,
              cursor: "default",
              transition: "background 0.1s ease",
            }}
          />
          <span style={{ fontSize: 9, color: hoverIdx === i ? "#555" : "#aaa", fontWeight: hoverIdx === i ? 700 : 400 }}>{fmtDate(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "6px 9px", borderRadius: 8, border: "1px solid #ddd", fontSize: 11.5, fontFamily: "'Noto Sans KR', sans-serif",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 9px", borderRadius: 8, border: "1px solid #ddd", fontSize: 11.5, fontFamily: "'Noto Sans KR', sans-serif",
};

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 가입자/이용자 추이 기간 — 기본값 최근 14일, 직접 선택 가능
  const [trendFrom, setTrendFrom] = useState(daysAgo(13));
  const [trendTo, setTrendTo] = useState(daysAgo(0));

  // 지역별 인기 장소 드릴다운
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");

  const fetchAnalytics = useCallback(async (params?: { trendFrom?: string; trendTo?: string; sido?: string; sigungu?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const qs = new URLSearchParams();
      qs.set("trendFrom", params?.trendFrom ?? trendFrom);
      qs.set("trendTo", params?.trendTo ?? trendTo);
      const sidoVal = params?.sido ?? sido;
      const sigunguVal = params?.sigungu ?? sigungu;
      if (sidoVal) qs.set("sido", sidoVal);
      if (sigunguVal) qs.set("sigungu", sigunguVal);

      const res = await fetch(`/api/admin/analytics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "불러오기 실패");
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendFrom, trendTo, sido, sigungu]);

  // ⚠ 관리자 인증은 이제 src/app/admin/layout.tsx가 한 번만 확인하고, 통과한
  // 뒤에만 이 페이지가 마운트됩니다 — 여기서 다시 확인할 필요가 없습니다.
  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTrendRange = () => fetchAnalytics({ trendFrom, trendTo });
  const resetTrendRange = () => {
    const f = daysAgo(13), t = daysAgo(0);
    setTrendFrom(f); setTrendTo(t);
    fetchAnalytics({ trendFrom: f, trendTo: t });
  };

  const onSidoChange = (v: string) => {
    setSido(v);
    setSigungu("");
    fetchAnalytics({ sido: v, sigungu: "" });
  };
  const onSigunguChange = (v: string) => {
    setSigungu(v);
    fetchAnalytics({ sido, sigungu: v });
  };

  return (
    <div className="ggk-body" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#F7F3E8", overflow: "hidden", alignItems: "center" }}>
      <AdminNav active="analytics" onRefresh={() => fetchAnalytics()} />
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ⚠ 막대그래프에 말풍선(툴팁)이 뜰 때 컨텐츠 높이가 살짝 바뀌면서
            overflowY:"auto"가 스크롤바를 나타났다 사라지게 해 화면이 흔들렸습니다.
            "scroll"로 고정해 스크롤바 자리를 항상 확보해둡니다. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "scroll", padding: "24px 28px 60px", scrollbarWidth: "thin" as any }}>
          {error && (
            <div style={{ padding: 14, borderRadius: 12, background: "#fff1f1", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {!data && loading && (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>불러오는 중...</div>
          )}

          {data && (
            <>
              {/* 핵심 지표 카드 — 항상 한 줄(6칸)로 출력 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
                <StatCard icon={Users} label="가입 회원 수" value={data.totals.members} sub={`비회원 ${data.totals.guests}명`} />
                <StatCard icon={TrendingUp} label="일간 이용자" value={data.totals.dau} />
                <StatCard icon={TrendingUp} label="주간 이용자" value={data.totals.wau} />
                <StatCard icon={TrendingUp} label="월간 이용자" value={data.totals.mau} />
                <StatCard icon={Repeat} label="재방문율" value={`${data.totals.retentionRate}%`} sub="최근 30일" />
                <StatCard icon={UserCheck} label="비회원 이용률" value={`${data.totals.guestVisitorRate}%`} sub="방문자 중" />
              </div>

              {/* 추이 차트 2개 — 기간 직접 선택 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                background: "white", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", padding: "10px 14px",
              }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#888" }}>추이 조회 기간</span>
                <input type="date" value={trendFrom} max={trendTo} onChange={(e) => setTrendFrom(e.target.value)} style={dateInputStyle} />
                <span style={{ color: "#ccc" }}>~</span>
                <input type="date" value={trendTo} min={trendFrom} max={daysAgo(0)} onChange={(e) => setTrendTo(e.target.value)} style={dateInputStyle} />
                <button onClick={applyTrendRange} style={{
                  padding: "6px 12px", borderRadius: 8, border: "none", background: "#5C7A4A", color: "white",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                }}>
                  조회
                </button>
                <button onClick={resetTrendRange} style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                  border: "1px solid #ddd", background: "white", color: "#777", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                  <RotateCcw size={11} />최근 14일
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div style={cardStyle}>
                  <div className="ggk-logo" style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 14 }}>
                    일별 신규 가입자 추이 ({fmtDate(data.trendFrom)} ~ {fmtDate(data.trendTo)})
                  </div>
                  <BarTrend data={data.signupsTrend} color="#5C7A4A" />
                </div>
                <div style={cardStyle}>
                  <div className="ggk-logo" style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 14 }}>
                    일별 순 이용자 추이 ({fmtDate(data.trendFrom)} ~ {fmtDate(data.trendTo)})
                  </div>
                  <BarTrend data={data.dailyVisitorsTrend} color="#8FA876" />
                </div>
              </div>

              {/* 검색어 / 인기 장소 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={cardStyle}>
                  <div className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 14 }}>
                    <Search size={14} color="#5C7A4A" /> 인기 검색어 TOP 10 (최근 30일)
                  </div>
                  {data.topSearches.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>아직 데이터가 쌓이지 않았습니다.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {data.topSearches.map((s, i) => (
                        <div key={s.query} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: "#aaa" }}>{i + 1}</span>
                          <span style={{ flex: 1, fontSize: 12.5, color: "#333" }}>{s.query}</span>
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{s.count}회</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                    <div className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#111" }}>
                      <MapPin size={14} color="#5C7A4A" /> 지역별 인기 장소 TOP 10
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={sido} onChange={(e) => onSidoChange(e.target.value)} style={selectStyle}>
                        <option value="">전국 (시/도 선택)</option>
                        {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select
                        value={sigungu}
                        onChange={(e) => onSigunguChange(e.target.value)}
                        disabled={!sido || data.availableSubRegions.length === 0}
                        style={{ ...selectStyle, opacity: !sido ? 0.5 : 1 }}
                      >
                        <option value="">{sido ? "전체 시/군/구" : "시/도 먼저 선택"}</option>
                        {data.availableSubRegions.map((sr) => <option key={sr} value={sr}>{sr}</option>)}
                      </select>
                    </div>
                  </div>
                  {data.topPlaces.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>
                      {sido ? "해당 지역의 데이터가 아직 없습니다." : "아직 데이터가 쌓이지 않았습니다."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {data.topPlaces.map((p, i) => (
                        <div key={`${p.region}-${p.subRegion}-${p.placeName}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: "#aaa" }}>{i + 1}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: "#48603A", background: "#E4EBDC",
                            padding: "2px 6px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap",
                          }}>{p.region} {p.subRegion !== "기타" ? p.subRegion : ""}</span>
                          <span style={{ flex: 1, fontSize: 12.5, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.placeName}</span>
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{p.count}회</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
