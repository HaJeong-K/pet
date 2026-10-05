"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── 사장님용 "내 가게 통계" ──
// 마이페이지 설정에서 여는 화면. 내 가게를 사람들이 얼마나 봤는지(조회·찜·후기)와 AI 코스·추천에서
// 얼마나 노출·선택됐는지를 보여줍니다. 숫자는 서버(/api/owner/stats)가 익명 이용 기록에서 셉니다.
// previewPlaceId: 관리자가 미리보기로 볼 업장(사장님 본인은 넘기지 않아도 본인 업장으로 조회됨)

type Stats = {
  placeId: number;
  placeName: string | null;
  views: { total: number; last30: number; last7: number };
  daily: { day: string; views: number }[];
  bookmarks: number;
  likes: number;
  reviews: number;
  last30: {
    courseIncluded: number; courseClicks: number; courseDirections: number; recommendClicks: number;
    recommendImpressions?: number; directions?: number; calls?: number; website?: number;
  };
  recentReviews?: { id: string; nickname: string; content: string; created_at: string; likes: number; ownerReplied: boolean }[];
};
export type OwnerStats = Stats;

/** 사장님 통계 조회(본인 가게, 관리자는 미리보기용 placeId 지정 가능) */
export async function fetchOwnerStats(previewPlaceId?: number | null): Promise<{ stats: Stats | null; error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { stats: null, error: "로그인이 필요해요." };
    const qs = previewPlaceId != null ? `?placeId=${previewPlaceId}` : "";
    const res = await fetch(`/api/owner/stats${qs}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json();
    return res.ok ? { stats: json, error: null } : { stats: null, error: json.error || "통계를 불러오지 못했어요." };
  } catch {
    return { stats: null, error: "통계를 불러오지 못했어요." };
  }
}

const fmt = (n: number) => Number(n || 0).toLocaleString("ko-KR");

export default function OwnerStatsPanel({ previewPlaceId }: { previewPlaceId?: number | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null); // 그래프에서 고른 날짜

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError("로그인이 필요해요."); return; }
        const qs = previewPlaceId != null ? `?placeId=${previewPlaceId}` : "";
        const res = await fetch(`/api/owner/stats${qs}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(json.error || "통계를 불러오지 못했어요."); return; }
        setStats(json);
      } catch {
        if (!cancelled) setError("통계를 불러오지 못했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewPlaceId]);

  if (loading) return <div style={{ fontSize: 12, color: "#999", textAlign: "center", padding: "20px 0" }}>불러오는 중...</div>;
  if (error || !stats) return <div style={{ fontSize: 12, color: "#999", textAlign: "center", padding: "20px 0" }}>{error || "통계가 없어요."}</div>;

  const max = Math.max(1, ...stats.daily.map((d) => d.views));
  const cards: { label: string; value: number; sub?: string }[] = [
    { label: "최근 7일 조회", value: stats.views.last7 },
    { label: "최근 30일 조회", value: stats.views.last30 },
    { label: "누적 조회", value: stats.views.total },
    { label: "찜", value: stats.bookmarks },
    { label: "좋아요", value: stats.likes },
    { label: "후기", value: stats.reviews },
  ];
  const funnel: { label: string; value: number; hint: string }[] = [
    { label: "AI 코스에 포함", value: stats.last30.courseIncluded, hint: "추천 코스의 정거장으로 노출된 횟수" },
    { label: "코스에서 선택", value: stats.last30.courseClicks, hint: "코스 안에서 내 가게를 눌러 본 횟수" },
    { label: "길찾기 연결", value: stats.last30.courseDirections, hint: "코스에서 내 가게로 길찾기를 연 횟수" },
    { label: "추천 목록에 노출", value: stats.last30.recommendImpressions ?? 0, hint: "추천 장소 목록에 내 가게가 보인 횟수" },
    { label: "추천 목록에서 선택", value: stats.last30.recommendClicks, hint: "추천 장소 목록에서 눌러 본 횟수" },
  ];
  // 내 가게 상세 화면에서 실제 방문·문의로 이어진 행동
  const actions: { label: string; value: number; hint: string }[] = [
    { label: "길찾기 열기", value: (stats.last30.directions ?? 0) + stats.last30.courseDirections, hint: "상세 화면·AI 코스에서 내 가게로 길찾기를 연 횟수" },
    { label: "전화 걸기", value: stats.last30.calls ?? 0, hint: "상세 화면에서 전화번호를 누른 횟수" },
    { label: "홈페이지 방문", value: stats.last30.website ?? 0, hint: "상세 화면에서 홈페이지 링크를 누른 횟수" },
  ];

  return (
    <div>
      {stats.placeName && <div style={{ fontSize: 13, fontWeight: 800, color: "#222", marginBottom: 10 }}>{stats.placeName}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#f8fafc", border: "1px solid #eef0f2", borderRadius: 11, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 10.5, color: "#888", fontWeight: 600 }}>{c.label}</div>
            <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#222", marginTop: 3 }}>{fmt(c.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#555", marginBottom: 6 }}>최근 30일 조회 추이</div>
      {/* 막대 위에 그날 조회수를 적고, 막대를 누르거나 올려 두면 아래에 날짜와 함께 보여 줍니다 */}
      <div
        role="img"
        aria-label={`최근 30일 조회 추이, 합계 ${stats.views.last30}회`}
        style={{ display: "flex", alignItems: "stretch", gap: 2, height: 110, padding: "6px 6px 0", background: "#f8fafc", border: "1px solid #eef0f2", borderRadius: 11 }}
      >
        {stats.daily.map((d) => {
          const picked = pickedDay === d.day;
          return (
            <div
              key={d.day}
              title={`${d.day.slice(5).replace("-", "/")} · ${d.views}회`}
              onClick={() => setPickedDay(picked ? null : d.day)}
              onMouseEnter={() => setPickedDay(d.day)}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "pointer" }}
            >
              {d.views > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 800, color: picked ? "#A8551F" : "#48603A", lineHeight: 1, marginBottom: 2, whiteSpace: "nowrap" }}>{d.views}</span>
              )}
              <div
                style={{
                  width: "100%", borderRadius: "3px 3px 0 0", flexShrink: 0,
                  // 숫자 자리(14px)를 남기고 가장 높은 막대가 꽉 차도록
                  height: d.views === 0 ? 2 : `max(5px, calc((100% - 14px) * ${d.views / max}))`,
                  background: d.views === 0 ? "#e5e7eb" : picked ? "#A8551F" : "#5C7A4A",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", margin: "3px 2px 6px" }}>
        <span>{stats.daily[0]?.day.slice(5).replace("-", "/")}</span>
        <span>오늘</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#666", margin: "0 2px 14px", minHeight: 17 }}>
        {(() => {
          const d = stats.daily.find((x) => x.day === pickedDay);
          return d
            ? <><b style={{ color: "#A8551F" }}>{d.day.slice(5).replace("-", "/")}</b> 조회 <b style={{ color: "#222" }}>{d.views}회</b></>
            : "막대를 누르면 그날 조회수를 볼 수 있어요.";
        })()}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#555", marginBottom: 6 }}>최근 30일 방문·문의로 이어진 행동</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {actions.map((a) => (
          <div key={a.label} title={a.hint} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 11, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 10.5, color: "#92400E", fontWeight: 700 }}>{a.label}</div>
            <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#78350F", marginTop: 3 }}>{fmt(a.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#555", marginBottom: 6 }}>최근 30일 AI 코스·추천</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {funnel.map((f) => (
          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#f8fafc", border: "1px solid #eef0f2", borderRadius: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>{f.label}</div>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>{f.hint}</div>
            </div>
            <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#5b21b6" }}>{fmt(f.value)}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: "#aaa", marginTop: 10, lineHeight: 1.6 }}>
        · 조회는 장소 상세 화면이 열린 횟수예요(같은 사람이 여러 번 열면 여러 번 세요).
        <br />· 길찾기·전화·홈페이지 횟수는 2026년 10월 5일부터 세기 시작했어요.
        <br />· 프리미엄에 등록하면 추천 정렬 가점과 광고 영역 노출로 조회가 늘어날 수 있어요.
      </p>
    </div>
  );
}
