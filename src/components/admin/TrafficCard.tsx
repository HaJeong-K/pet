"use client";

// 관리자 통계의 "유입 경로" 칸 — 마케팅 채널별로 몇 명이 들어와서, 다시 오고, 회원이 됐는지.
// 아래의 "홍보 링크 만들기"로 채널마다 다른 링크를 만들어 블로그·인스타·숏폼 등에 붙이면 그 채널의 성과로 셉니다.
// 계산 규칙은 src/lib/trafficReport.ts, 채널 판별은 src/lib/trafficSource.ts.

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Route } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/siteUrl";
import { CHANNELS, campaignLink, channelLabel } from "@/lib/trafficSource";
import type { ChannelStat } from "@/lib/trafficReport";

type Report = { days: number; totalViews: number; truncated: boolean; channels: ChannelStat[]; trackedVisitors: number };
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

export default function TrafficCard() {
  const [days, setDays] = useState<30 | 90>(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState("naver_blog");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("로그인이 필요해요.");
        const res = await fetch(`/api/admin/traffic?days=${days}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오지 못했어요.");
        if (!cancelled) { setReport(json); setError(null); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const link = campaignLink(siteUrl, channel, campaign);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };
  const total = report?.trackedVisitors ?? 0;

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <Route size={16} color="#5C7A4A" />
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>유입 경로</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {([30, 90] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} style={{ padding: "5px 11px", borderRadius: 999, border: "none", background: days === d ? "#5C7A4A" : "#f1f2f4", color: days === d ? "white" : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>최근 {d}일</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 4, lineHeight: 1.65 }}>
        처음 들어온 채널을 기준으로, 그 채널이 데려온 사람이 다시 오고 회원이 됐는지 봅니다.<br />
        유입 경로 기록을 시작한 뒤의 방문만 셉니다.
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: "#b91c1c" }}>{error}</div>}
      {report && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "#888", fontSize: 11.5, textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>채널</th>
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>방문자</th>
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>비중</th>
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>재방문</th>
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>회원</th>
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>신규 가입</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.length === 0 && <tr><td colSpan={6} style={{ padding: "18px 8px", textAlign: "center", color: "#aaa" }}>아직 유입 경로가 기록된 방문이 없어요.</td></tr>}
              {report.channels.map((c) => (
                <tr key={c.channel} style={{ borderTop: "1px solid #f1efe6", textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "8px", fontWeight: 700, color: "#333" }}>{channelLabel(c.channel)}</td>
                  <td style={{ padding: "8px" }}>{c.visitors.toLocaleString("ko-KR")}</td>
                  <td style={{ padding: "8px", color: "#888" }}>{pct(c.visitors, total)}</td>
                  <td style={{ padding: "8px" }}>{c.returning} <span style={{ color: "#999", fontSize: 11.5 }}>({pct(c.returning, c.visitors)})</span></td>
                  <td style={{ padding: "8px" }}>{c.members} <span style={{ color: "#999", fontSize: 11.5 }}>({pct(c.members, c.visitors)})</span></td>
                  <td style={{ padding: "8px", fontWeight: 700, color: "#3F6B2B" }}>{c.signups}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.truncated && <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 6 }}>기록이 많아 최근 10만 건까지만 계산했어요.</div>}
        </div>
      )}

      {/* 홍보 링크 만들기 */}
      <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#F7F3E8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#444" }}><Link2 size={14} />홍보 링크 만들기</div>
        <div style={{ fontSize: 11.5, color: "#888", marginTop: 3, lineHeight: 1.6 }}>
          채널마다 이 링크를 붙이면 그 채널로 들어온 사람으로 따로 셉니다.<br />
          캠페인 이름(선택)은 같은 채널 안에서 글·영상별로 나눠 보고 싶을 때 적어요. 영문·숫자만 써요.
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
          {CHANNELS.filter((c) => c.linkable).map((c) => (
            <button key={c.id} onClick={() => setChannel(c.id)} aria-pressed={channel === c.id} style={{ padding: "6px 11px", borderRadius: 999, border: `1px solid ${channel === c.id ? "#5C7A4A" : "#e2dcc8"}`, background: channel === c.id ? "#E4EBDC" : "white", color: channel === c.id ? "#3F5230" : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{c.label}</button>
          ))}
        </div>
        <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="캠페인 이름 (선택) — 예: launch_event, dog_cafe_daegu" maxLength={40} style={{ marginTop: 9, width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "stretch" }}>
          <code style={{ flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 9, background: "white", border: "1px solid #e8e2d2", fontSize: 12, color: "#333", overflowX: "auto", whiteSpace: "nowrap", userSelect: "all" }}>{link}</code>
          <button onClick={copy} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 13px", borderRadius: 9, border: "none", background: copied ? "#3F6B2B" : "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>
    </div>
  );
}
