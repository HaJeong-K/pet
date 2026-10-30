"use client";

// 관리자 "프리미엄" 화면의 "배너 관리" 탭.
//   · 한도 변경 요청: 사장님이 "2주에 한 번" 한도를 풀어 달라고 보낸 요청을 승인·거절합니다(승인하면 한 번 더 바꿀 수 있게 열림).
//   · 가게별 배너: 사장님이 만든 문구·사진·글꼴을 실제 모양 그대로 보고, 부적절하면 내리거나, 요청 없이도 한도를 한 번 풀어 줄 수 있습니다.
//     노출 횟수도 함께 보여서 같은 동네 가게끼리 고르게 나가는지 확인할 수 있습니다.

import { useCallback, useEffect, useState } from "react";
import LogoLoader from "@/components/LogoLoader";
import BannerCreativeView from "@/components/BannerCreativeView";
import { supabase } from "@/lib/supabase";
import type { BannerFontId, ChangeAllowance } from "@/lib/bannerCreative";
import { bannerFont } from "@/lib/bannerCreative";

type Request = { id: number; place_id: number; placeName: string; reason: string; status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string; processed_at: string | null; processed_by: string | null };
type Banner = {
  placeId: number; placeName: string; region: string; address: string | null; placeImage: string | null;
  headline: string; body: string | null; imageUrl: string | null; font: BannerFontId; changedAt: string;
  extraChanges: number; hidden: boolean; hiddenReason: string | null; live: boolean; allowance: ChangeAllowance; serves: number;
};
type Data = { ready: boolean; requests: Request[]; banners: Banner[] };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/banners", { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}

const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "14px 16px", marginBottom: 12 };
const btn = (bg: string, color: string, border = "none"): React.CSSProperties => ({ padding: "8px 13px", borderRadius: 9, border, background: bg, color, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, color, background: bg, padding: "2px 9px", borderRadius: 999 });
const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const title: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "#333", margin: "4px 0 10px" };

export default function BannerAdminPanel({ refreshKey = 0, onCount }: { refreshKey?: number; onCount?: (pending: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = (await call("GET")) as Data;
      setData(json);
      setError(null);
      onCount?.(json.requests.filter((r) => r.status === "pending").length);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setData((prev) => prev ?? { ready: true, requests: [], banners: [] }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load, refreshKey]);

  const run = async (body: Record<string, unknown>, confirmText?: string) => {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    try { await call("POST", body); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  };

  if (!data) return <div style={{ textAlign: "center", padding: "60px 0" }}><LogoLoader /></div>;
  if (!data.ready) {
    return <div style={{ ...card, background: "#fff7ed", borderColor: "#fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.7 }}>배너 표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/banner-ads.sql</b>을 실행하면 열려요.</div>;
  }
  const pending = data.requests.filter((r) => r.status === "pending");
  const done = data.requests.filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <div>
      {error && <div style={{ ...card, background: "#fff7ed", borderColor: "#fed7aa", fontSize: 13, color: "#9a3412" }}>{error}</div>}

      <div style={title}>한도 변경 요청 {pending.length > 0 && <span style={chip("#FEF3C7", "#92400E")}>{pending.length}건 대기</span>}</div>
      {pending.length === 0 && <div style={{ ...card, fontSize: 12.5, color: "#666" }}>기다리는 요청이 없어요. 사장님은 배너를 2주에 한 번 바꿀 수 있고, 그 전에 바꿔야 하면 여기로 요청이 와요.</div>}
      {pending.map((r) => (
        <div key={r.id} style={{ ...card, borderColor: "#FDE68A", background: "#FFFDF5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b className="ggk-logo" style={{ fontSize: 14.5, color: "#111" }}>{r.placeName}</b>
            <span style={{ fontSize: 11, color: "#6e6e6e", marginLeft: "auto" }}>{fmt(r.created_at)} 요청</span>
          </div>
          <div style={{ marginTop: 7, fontSize: 13, color: "#444", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.reason}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => run({ action: "approve", requestId: r.id }, `"${r.placeName}"이(가) 배너를 한 번 더 바꿀 수 있게 열어 줄까요?`)} style={btn("#7c3aed", "white")}>승인 — 한 번 더 바꿀 수 있게</button>
            <button disabled={busy} onClick={() => { const note = window.prompt("거절 사유를 사장님에게 알려 주세요(선택)", ""); if (note !== null) run({ action: "reject", requestId: r.id, adminNote: note }); }} style={btn("#fff5f5", "#dc2626", "1px solid #fecaca")}>거절</button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <div style={{ ...card, padding: "11px 14px" }}>
          {done.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "#666", lineHeight: 1.7, flexWrap: "wrap" }}>
              <span style={chip(r.status === "approved" ? "#DCFCE7" : "#FEE2E2", r.status === "approved" ? "#15803D" : "#B91C1C")}>{r.status === "approved" ? "승인" : "거절"}</span>
              <b style={{ color: "#333" }}>{r.placeName}</b>
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{r.reason}{r.admin_note ? ` → ${r.admin_note}` : ""}</span>
              <span style={{ color: "#707070" }}>{r.processed_at ? fmt(r.processed_at) : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...title, marginTop: 22 }}>가게별 배너 {data.banners.length}곳</div>
      {data.banners.length === 0 && <div style={{ ...card, fontSize: 12.5, color: "#666" }}>아직 배너를 만든 가게가 없어요. 사장님 화면의 &ldquo;광고&rdquo;에서 문구·사진·글꼴을 골라 만들 수 있어요.</div>}
      {data.banners.map((b) => {
        const view = { name: b.placeName, address: b.address, headline: b.headline, body: b.body, image: b.imageUrl || b.placeImage, font: b.font };
        return (
          <div key={b.placeId} style={{ ...card, opacity: b.hidden ? 0.8 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <b className="ggk-logo" style={{ fontSize: 14.5, color: "#111" }}>{b.placeName}</b>
              <span style={chip("#f5f6f8", "#555")}>{b.region}</span>
              {b.hidden ? <span style={chip("#FEE2E2", "#B91C1C")}>내림</span> : b.live ? <span style={chip("#f3f0ff", "#7c3aed")}>노출 중</span> : <span style={chip("#f1f2f4", "#777")}>노출 전(요금제·혜택 없음)</span>}
              <span style={chip("#f5f6f8", "#555")}>지금까지 {b.serves.toLocaleString("ko-KR")}번 노출</span>
              <a href={`/place/${b.placeId}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 11.5, color: "#5C7A4A", fontWeight: 700 }}>장소 화면</a>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 11, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ width: 150, height: 210, display: "flex", flexShrink: 0 }}><BannerCreativeView banner={view} shape="rail" /></div>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #eadfbf", maxWidth: 380 }}><BannerCreativeView banner={view} shape="strip" style={{ borderBottom: "none" }} /></div>
                <div style={{ marginTop: 9, fontSize: 11.5, color: "#5c5c5c", lineHeight: 1.7 }}>
                  글꼴 {bannerFont(b.font).label} · 마지막 변경 {fmt(b.changedAt)}<br />
                  {b.allowance.allowed ? (b.allowance.usesExtra ? `한도가 풀려 있음(추가 변경 ${b.extraChanges}회 남음)` : "지금 바꿀 수 있음") : `${b.allowance.daysLeft}일 뒤에 바꿀 수 있음`}
                  {b.hidden && b.hiddenReason && <><br />내린 이유: {b.hiddenReason}</>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {!b.allowance.allowed && <button disabled={busy} onClick={() => run({ action: "grant", placeId: b.placeId }, `"${b.placeName}"이(가) 배너를 한 번 더 바꿀 수 있게 열어 줄까요?`)} style={btn("#f7f3ff", "#7c3aed", "1px solid #ddd0ff")}>한도 한 번 풀어 주기</button>}
                  {b.hidden
                    ? <button disabled={busy} onClick={() => run({ action: "show", placeId: b.placeId })} style={btn("#E4EBDC", "#48603A")}>다시 올리기</button>
                    : <button disabled={busy} onClick={() => { const reason = window.prompt("배너를 내리는 이유를 사장님에게 알려 주세요", ""); if (reason !== null) run({ action: "hide", placeId: b.placeId, reason }); }} style={btn("#fff5f5", "#dc2626", "1px solid #fecaca")}>배너 내리기</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
