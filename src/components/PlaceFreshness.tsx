"use client";

// 장소 상세의 "정보 확인" 칸 — 이 장소 정보가 언제, 누구에게 마지막으로 확인됐는지 보여 주고, 다녀온 사람이 한 번에 확인을 남깁니다.
//   · 마지막 확인: 방문자 확인 · 사장님 확인 · 공공데이터 갱신 중 가장 최근 것(src/lib/placeChecks.ts)
//   · 다녀왔어요: "정보가 맞아요" / "달라졌어요"(동반 불가 · 폐업 · 정보 다름)
//   · 최근에 "달라졌어요"가 몰리면 방문 전에 전화로 확인하라고 알립니다.
//   · 사장님 본인 가게면 "지금 정보가 맞아요" 버튼으로 사장님 확인을 남깁니다.
// 로그인하지 않아도 누를 수 있습니다(기기 식별값으로 한 사람이 여러 번 세지지 않게).

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, ChevronDown, ChevronUp, Database, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getUserKey } from "@/lib/analytics";
import { CHANGE_DETAILS, changeDetailLabel, freshnessOf, relativeDay, type ChangeDetail, type CheckSummary } from "@/lib/placeChecks";

type Info = {
  ready: boolean;
  summary?: CheckSummary;
  ownerVerifiedAt?: string | null;
  dataSource?: string | null;
  dataSyncedAt?: string | null;
  mine?: { verdict: "ok" | "changed"; detail: ChangeDetail | null; at: string } | null;
};

const TONE = {
  fresh: { bg: "#ECF5E6", border: "#CFE3C0", color: "#3F6B2B", label: "최근 확인됨" },
  normal: { bg: "#F6F4EC", border: "#E6E1CF", color: "#6B6447", label: "확인한 지 조금 됐어요" },
  stale: { bg: "#FFF7ED", border: "#FED7AA", color: "#9A3412", label: "확인한 지 오래됐어요" },
} as const;
const BY_LABEL = { visitor: "방문자 확인", owner: "사장님 확인", data: "공공데이터 갱신" } as const;
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function PlaceFreshness({ placeId, placeName, isOwner, phone }: { placeId: number; placeName: string; isOwner: boolean; phone?: string | null }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (): Promise<Info | null> => {
    try {
      const res = await fetch(`/api/place-checks?placeId=${placeId}&userKey=${encodeURIComponent(getUserKey())}`, { headers: await authHeader(), cache: "no-store" });
      return res.ok ? ((await res.json()) as Info) : null;
    } catch { return null; }
  }, [placeId]);
  useEffect(() => {
    let cancelled = false;
    load().then((next) => { if (!cancelled) setInfo(next); });
    return () => { cancelled = true; };
  }, [load]);

  // 표가 아직 없거나(SQL 실행 전) 불러오지 못하면 칸을 그리지 않습니다.
  if (!info?.ready || !info.summary) return null;
  const { summary } = info;
  const fresh = freshnessOf({ lastOkAt: summary.lastOkAt, ownerVerifiedAt: info.ownerVerifiedAt, dataSyncedAt: info.dataSyncedAt });
  const tone = TONE[fresh.tone];

  const send = async (verdict: "ok" | "changed", detail?: ChangeDetail) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/place-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ placeId, verdict, detail, userKey: getUserKey(), placeName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "남기지 못했어요.");
      setChoosing(false);
      setMessage({ ok: true, text: verdict === "ok" ? "고마워요! 다음 보호자에게 큰 도움이 돼요." : "알려 주셔서 고마워요. 확인한 뒤 정보를 고칠게요." });
      setInfo((await load()) ?? info);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "남기지 못했어요." }); }
    finally { setBusy(false); }
  };

  const ownerConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/update-place", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ placeId, confirmOnly: true }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "확인을 남기지 못했어요.");
      setMessage({ ok: true, text: "사장님 확인을 남겼어요. 손님에게 '사장님 확인'으로 보여요." });
      setInfo((await load()) ?? info);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "확인을 남기지 못했어요." }); }
    finally { setBusy(false); }
  };

  const row = (Icon: typeof Users, text: React.ReactNode) => (
    <div className="ggk-body" style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "#555", lineHeight: 1.5 }}>
      <Icon size={12} style={{ flexShrink: 0, marginTop: 2, color: "#8a8f80" }} />
      <span>{text}</span>
    </div>
  );
  const topChanged = summary.changed[0];

  return (
    <div data-place-freshness style={{ marginTop: 10, borderRadius: 12, border: `1px solid ${tone.border}`, background: tone.bg, padding: "11px 12px" }}>
      {/* 마지막 확인 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <ShieldCheck size={14} color={tone.color} />
        <span className="ggk-title" style={{ fontSize: 12.5, fontWeight: 800, color: tone.color }}>
          {fresh.at && fresh.by ? `${relativeDay(fresh.at)} ${BY_LABEL[fresh.by]}` : "아직 확인 기록이 없어요"}
        </span>
        <span className="ggk-body" style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: tone.color, opacity: 0.8 }}>{tone.label}</span>
      </div>

      <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
        {row(Users, summary.okCount > 0
          ? <>최근 3개월 동안 방문자 <b>{summary.okCount}명</b>이 &ldquo;정보가 맞아요&rdquo;를 눌렀어요{summary.lastOkAt ? ` (마지막 ${relativeDay(summary.lastOkAt)})` : ""}</>
          : "아직 방문자 확인이 없어요. 다녀오셨다면 첫 확인을 남겨 주세요.")}
        {info.ownerVerifiedAt && row(BadgeCheck, <>사장님이 <b>{fmtDate(info.ownerVerifiedAt)}</b>에 정보를 확인했어요</>)}
        {info.dataSource && info.dataSyncedAt && row(Database, <>{info.dataSource} 공공데이터 · {fmtDate(info.dataSyncedAt)} 갱신</>)}
      </div>

      {/* "달라졌어요"가 몰리면 경고 */}
      {summary.warn && topChanged && (
        <div className="ggk-body" style={{ marginTop: 9, padding: "8px 10px", borderRadius: 9, background: "#FEF2F2", border: "1px solid #FECACA", display: "flex", gap: 7, fontSize: 11.5, color: "#991B1B", lineHeight: 1.55 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            최근 방문자 {summary.changedCount}명이 &ldquo;{changeDetailLabel(topChanged.detail)}&rdquo; 등 정보가 달라졌다고 알려 줬어요.<br />
            방문 전에 {phone ? <>전화(<b>{phone}</b>)로</> : "가게에"} 한 번 확인해 주세요.
          </span>
        </div>
      )}

      {/* 다녀온 사람의 확인 */}
      {!isOwner && (
        <div style={{ marginTop: 10 }}>
          {info.mine && !choosing ? (
            <div className="ggk-body" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#555", flexWrap: "wrap" }}>
              <Check size={13} color="#3F6B2B" />
              {relativeDay(info.mine.at)}에 &ldquo;{info.mine.verdict === "ok" ? "정보가 맞아요" : changeDetailLabel(info.mine.detail)}&rdquo;를 남겼어요
              <button onClick={() => setChoosing(true)} style={{ marginLeft: "auto", padding: "4px 9px", borderRadius: 8, border: "1px solid #ddd", background: "white", fontSize: 11, fontWeight: 700, color: "#666", cursor: "pointer" }}>바꾸기</button>
            </div>
          ) : (
            <>
              <div className="ggk-body" style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>다녀오셨나요? 지금도 정보가 맞는지 알려 주세요</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button onClick={() => send("ok")} disabled={busy} className="ggk-body" style={{ padding: "9px 0", borderRadius: 9, border: "none", background: "#5C7A4A", color: "white", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>정보가 맞아요</button>
                <button onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} disabled={busy} className="ggk-body" style={{ padding: "9px 0", borderRadius: 9, border: "1px solid #E7B9B4", background: "white", color: "#B42318", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  달라졌어요 {choosing ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
              {choosing && (
                <div style={{ marginTop: 6, display: "grid", gap: 5 }}>
                  {CHANGE_DETAILS.map((d) => (
                    <button key={d.id} onClick={() => send("changed", d.id)} disabled={busy} className="ggk-body" style={{ textAlign: "left", padding: "8px 10px", borderRadius: 9, border: "1px solid #eee", background: "white", cursor: busy ? "default" : "pointer" }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#333" }}>{d.label}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "#999", marginTop: 1 }}>{d.hint}</span>
                    </button>
                  ))}
                  <div className="ggk-body" style={{ fontSize: 10.5, color: "#999", lineHeight: 1.5 }}>바뀐 내용을 자세히 알려 주시려면 메뉴(⋮)의 &ldquo;빠진 정보 제보하기&rdquo;를 이용해 주세요.</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 사장님 본인 가게 */}
      {isOwner && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={ownerConfirm} disabled={busy} className="ggk-body" style={{ padding: "8px 12px", borderRadius: 9, border: "none", background: "#5C7A4A", color: "white", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <BadgeCheck size={13} />지금 정보가 맞아요
          </button>
          <span className="ggk-body" style={{ flex: "1 1 160px", fontSize: 10.5, color: "#777", lineHeight: 1.5 }}>정보가 그대로라면 눌러 주세요. 손님에게 &ldquo;사장님 확인&rdquo; 날짜로 보여요.</span>
        </div>
      )}

      {message && <div role="status" className="ggk-body" style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: message.ok ? "#3F6B2B" : "#B91C1C" }}>{message.text}</div>}
    </div>
  );
}
