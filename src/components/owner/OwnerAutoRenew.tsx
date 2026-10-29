"use client";

// 요금제 자동 연장 — 두 가지 모양으로 씁니다.
//   · mode="prompt": 사장님 센터에 들어오면, 이용 기간이 14일 안으로 남았고 아직 정하지 않았을 때 뜨는 팝업
//       "○월 ○일에 이용 기간이 끝나요. 기한이 끝나면 자동으로 연장하여 이용하시겠습니까?"
//       [네, 자동으로 연장할게요] [이번 기간만 이용할게요] [나중에 정할게요(이번 접속 동안 안 뜸)]
//   · mode="card": "광고 상품" 메뉴의 설정 칸 — 켜기/끄기, 연장할 요금제·개월 수
// 결제대행(PG) 연동 전이라, 자동 연장을 켜면 만료 3일 전에 연장 신청이 자동으로 접수되고 입금 안내를 보내 드립니다.
// 서버는 /api/owner/auto-renew, 규칙은 src/lib/premiumRenew.ts.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { OWNER_PLANS, PLAN_NAME, type PaidPlanId } from "@/lib/ownerPlans";
import { daysLeft, RENEW_MONTH_OPTIONS, shouldPromptRenew } from "@/lib/premiumRenew";

type Setting = { ready: boolean; enabled: boolean | null; plan: PaidPlanId | null; months: number; expiresAt: string | null; currentPlan: PaidPlanId | null };
const DISMISS_KEY = "ggk-renew-later";
const dateText = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 999, border: `1px solid ${on ? "#B45309" : "#e2dcc8"}`, background: on ? "#FEF3C7" : "white", color: on ? "#92400E" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

export default function OwnerAutoRenew({ placeId, isPreview, mode }: { placeId: number; isPreview: boolean; mode: "prompt" | "card" }) {
  const [s, setS] = useState<Setting | null>(null);
  const [plan, setPlan] = useState<PaidPlanId | null>(null);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } });

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/owner/auto-renew${isPreview ? `?placeId=${placeId}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as Setting;
    setS(json);
    setPlan(json.plan ?? json.currentPlan);
    setMonths(json.months || 1);
  }, [placeId, isPreview]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const save = async (enabled: boolean) => {
    if (busy || isPreview) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/owner/auto-renew", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ enabled, plan, months }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "저장하지 못했어요.");
      setMessage({ ok: true, text: enabled ? "자동 연장을 켰어요. 만료 3일 전에 연장 신청이 접수되고 입금 안내를 보내 드려요." : "이번 기간만 이용하도록 정했어요. 언제든 다시 켤 수 있어요." });
      await load();
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." }); }
    finally { setBusy(false); }
  };

  if (!s?.ready || !s.expiresAt) return null;
  const options = (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#666", width: 64 }}>요금제</span>
        {OWNER_PLANS.filter((p): p is typeof p & { id: PaidPlanId } => p.id !== "basic").map((p) => <button key={p.id} type="button" onClick={() => setPlan(p.id)} aria-pressed={plan === p.id} style={chip(plan === p.id)}>{p.name}</button>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#666", width: 64 }}>연장 기간</span>
        {RENEW_MONTH_OPTIONS.map((m) => <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m} style={chip(months === m)}>{m}개월</button>)}
      </div>
    </div>
  );

  if (mode === "prompt") {
    if (isPreview || hidden || !shouldPromptRenew(s.expiresAt, s.enabled)) return null;
    const later = () => { try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* 저장소를 못 쓰면 이번 화면에서만 닫힘 */ } setHidden(true); };
    return (
      <div role="dialog" aria-modal="true" aria-label="요금제 자동 연장" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, background: "white", borderRadius: 20, padding: "22px 20px", boxSizing: "border-box", wordBreak: "keep-all" }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}><RefreshCw size={22} color="#B45309" /></div>
          <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#222", marginTop: 12, lineHeight: 1.45 }}>
            {s.currentPlan ? PLAN_NAME[s.currentPlan] : "요금제"} 이용 기간이<br />{dateText(s.expiresAt)}에 끝나요 (D-{daysLeft(s.expiresAt)})
          </div>
          <div style={{ fontSize: 13.5, color: "#555", marginTop: 8, lineHeight: 1.7 }}>
            기한이 끝나면 자동으로 연장하여 이용하시겠습니까?<br />
            <span style={{ fontSize: 12, color: "#888" }}>자동 연장을 켜면 만료 3일 전에 연장 신청이 접수되고 입금 안내를 보내 드려요. 언제든 끌 수 있어요.</span>
          </div>
          <div style={{ marginTop: 14 }}>{options}</div>
          {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
          <div style={{ display: "grid", gap: 6, marginTop: 16 }}>
            <button onClick={() => save(true)} disabled={busy} style={{ padding: "13px 0", borderRadius: 12, border: "none", background: "#B45309", color: "white", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>네, 자동으로 연장할게요</button>
            <button onClick={() => save(false)} disabled={busy} style={{ padding: "12px 0", borderRadius: 12, border: "1px solid #e2dcc8", background: "white", color: "#555", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>이번 기간만 이용할게요</button>
            <button onClick={later} style={{ padding: "8px 0", border: "none", background: "transparent", color: "#999", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>나중에 정할게요</button>
          </div>
        </div>
      </div>
    );
  }

  // 광고 상품 메뉴의 설정 칸
  return (
    <div style={{ background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <RefreshCw size={16} color="#B45309" />
        <div className="ggk-logo" style={{ fontSize: 15.5, fontWeight: 800, color: "#222" }}>자동 연장</div>
        <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: s.enabled ? "#DCFCE7" : s.enabled === false ? "#F1F5F9" : "#FEF3C7", color: s.enabled ? "#166534" : s.enabled === false ? "#64748B" : "#92400E" }}>
          {s.enabled ? "켜짐" : s.enabled === false ? "꺼짐(이번 기간만)" : "아직 정하지 않음"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>{dateText(s.expiresAt)} 만료 · D-{daysLeft(s.expiresAt)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "#777", marginTop: 6, lineHeight: 1.7 }}>
        기한이 끝나면 자동으로 연장합니다. 만료 3일 전에 연장 신청이 접수되고 입금 안내를 보내 드려요.<br />
        {s.enabled && s.plan ? <>지금 설정: <b style={{ color: "#333" }}>{PLAN_NAME[s.plan]} {s.months}개월</b></> : null}
      </div>
      {!isPreview && (
        <div style={{ marginTop: 12 }}>
          {options}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => save(true)} disabled={busy} style={{ padding: "10px 16px", borderRadius: 11, border: "none", background: "#B45309", color: "white", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{s.enabled ? "설정 저장" : "자동 연장 켜기"}</button>
            {s.enabled !== false && <button onClick={() => save(false)} disabled={busy} style={{ padding: "10px 16px", borderRadius: 11, border: "1px solid #e2dcc8", background: "white", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>이번 기간만 이용</button>}
          </div>
        </div>
      )}
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
    </div>
  );
}
