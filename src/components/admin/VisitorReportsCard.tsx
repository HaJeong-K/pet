"use client";

// 관리자 데이터 품질 화면의 "방문자 제보" 칸 — 다녀온 이용자가 "달라졌어요"를 남긴 장소들.
// 경고 상태(달라졌어요가 맞아요보다 많은 곳)를 먼저 보여 주고, 누르면 장소 화면이 새 탭으로 열려 바로 고치거나 숨길 수 있습니다.

import { useEffect, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { changeDetailLabel, relativeDay, type CheckSummary } from "@/lib/placeChecks";

type Row = CheckSummary & { placeId: number; name: string; lastChangedAt: string };

export default function VisitorReportsCard() {
  const [data, setData] = useState<{ ready: boolean; places: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("로그인이 필요해요.");
        const res = await fetch("/api/admin/place-checks", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오지 못했어요.");
        if (!cancelled) setData(json);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Users size={15} color="#5C7A4A" />
        <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#222" }}>방문자 제보 (최근 3개월)</div>
        {data?.places && data.places.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C" }}>{data.places.filter((p) => p.warn).length}곳 확인 필요</span>}
      </div>
      <div style={{ fontSize: 12, color: "#5c5c5c", marginTop: 4, lineHeight: 1.6 }}>
        장소 화면의 &ldquo;달라졌어요&rdquo;로 들어온 제보예요. 빨간 표시는 &ldquo;정보가 맞아요&rdquo;보다 제보가 많은 곳이라, 손님에게도 경고가 보이고 있어요.
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 12.5, color: "#b91c1c" }}>{error}</div>}
      {data && !data.ready && <div style={{ marginTop: 8, fontSize: 12.5, color: "#9a3412" }}>표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/place-verification.sql</b>을 실행해 주세요.</div>}
      {data?.ready && data.places.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#6e6e6e" }}>들어온 제보가 없어요.</div>}
      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {data?.places.map((p) => (
          <a key={p.placeId} href={`/place/${p.placeId}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, border: `1px solid ${p.warn ? "#FECACA" : "#eee"}`, background: p.warn ? "#FEF2F2" : "white", textDecoration: "none", color: "#222", flexWrap: "wrap" }}>
            {p.warn && <AlertTriangle size={13} color="#B91C1C" />}
            <b style={{ fontSize: 13 }}>{p.name}</b>
            <span style={{ fontSize: 11.5, color: "#666" }}>{p.changed.map((c) => `${changeDetailLabel(c.detail)} ${c.count}`).join(" · ")}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#666" }}>맞아요 {p.okCount} · 마지막 제보 {p.lastChangedAt ? relativeDay(p.lastChangedAt) : "-"}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
