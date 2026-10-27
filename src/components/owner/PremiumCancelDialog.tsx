"use client";

// 프리미엄 해지 창 — 사장님 센터 "광고 상품"의 [해지하기]에서 열립니다(서버: /api/owner/premium-cancel).
//   ① 정말 해지할까요? — 해지하면 없어지는 혜택과 이용 마지막 날을 보여 주고, 이유를 고르게 합니다(선택).
//   ② 시크릿 프라이스 — 아직 한 번도 받지 않은 업장이면, 해지 대신 "다음 30일 30% 할인"을 제안합니다(기능은 그대로).
//   ③ 결과 — 할인을 받았거나, 해지가 접수됐다는 안내.

import { useState } from "react";
import { Gift, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PERIOD_DAYS, PLAN_MONTHLY_PRICE, PLAN_NAME, RETENTION_DISCOUNT_PERCENT, won, type PaidPlanId } from "@/lib/ownerPlans";

const REASONS = ["광고 효과를 잘 모르겠어요", "요금이 부담돼요", "잠시 쉬어요(휴업·비수기)", "다른 광고를 쓰려고요", "기타"];

type Step = "confirm" | "offer" | "retained" | "cancelled";

export default function PremiumCancelDialog({ plan, expiresText, offerAvailable, onClose, onDone }: {
  plan: PaidPlanId;
  /** 이용 마지막 날(예: 2026. 11. 24.) */
  expiresText: string;
  offerAvailable: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("confirm");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = PLAN_MONTHLY_PRICE[plan];
  const secret = Math.floor((price * (1 - RETENTION_DISCOUNT_PERCENT / 100)) / 100) * 100;

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요해요.");
      const res = await fetch("/api/owner/premium-cancel", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
      return json;
    } finally { setBusy(false); }
  };
  const fullReason = [reason, detail.trim()].filter(Boolean).join(" — ");
  const cancel = async (offered: boolean) => {
    try { await send({ step: "cancel", reason: fullReason, offered }); setStep("cancelled"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했어요."); }
  };
  const accept = async () => {
    try { await send({ step: "accept_offer", reason: fullReason }); setStep("retained"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했어요."); }
  };

  const button = (primary: boolean, disabled = false): React.CSSProperties => ({
    flex: 1, padding: "13px 0", borderRadius: 12, border: primary ? "none" : "1px solid #ddd", fontSize: 14, fontWeight: 800, fontFamily: "inherit",
    background: disabled ? "#d6d3c9" : primary ? "#B45309" : "white", color: primary ? "white" : "#666", cursor: disabled ? "default" : "pointer",
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="프리미엄 해지" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 440, maxHeight: "calc(100dvh - 32px)", overflowY: "auto", background: "white", borderRadius: 20, padding: "24px 22px 20px", boxSizing: "border-box", wordBreak: "keep-all" }}>
        <button onClick={onClose} aria-label="닫기" style={{ position: "absolute", right: 14, top: 14, width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>

        {step === "confirm" && (
          <>
            <div className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, color: "#222", paddingRight: 36 }}>정말 해지할까요?</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 10, lineHeight: 1.75 }}>
              해지해도 <b>{expiresText}</b>까지는 {PLAN_NAME[plan]} 혜택이 그대로 유지돼요.<br />
              그 뒤에는 기본 요금제로 돌아가고, 아래 혜택이 사라져요.
            </div>
            <ul style={{ margin: "10px 0 0", padding: "12px 14px 12px 30px", borderRadius: 12, background: "#FFFBEB", fontSize: 12.5, color: "#78350F", lineHeight: 1.8 }}>
              <li>주변 장소 목록 맨 위 노출과 프리미엄 배지</li>
              <li>AI 추천 코스 정거장 포함</li>
              {plan !== "premium" && <li>상품 진열·예약 받기</li>}
              {plan === "local" && <li>동네 배너 광고</li>}
            </ul>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#444", marginTop: 16 }}>해지하시는 이유 <span style={{ fontWeight: 600, color: "#aaa" }}>(선택)</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(reason === r ? "" : r)} aria-pressed={reason === r} style={{ padding: "7px 11px", borderRadius: 999, border: `1px solid ${reason === r ? "#B45309" : "#e2dcc8"}`, background: reason === r ? "#FEF3C7" : "white", color: reason === r ? "#92400E" : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{r}</button>
              ))}
            </div>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} rows={2} placeholder="더 알려 주실 내용이 있으면 적어 주세요(선택)" style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
            {error && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={button(true)}>계속 이용할게요</button>
              <button onClick={() => (offerAvailable ? setStep("offer") : cancel(false))} disabled={busy} style={button(false, busy)}>{busy ? "처리 중…" : "해지할게요"}</button>
            </div>
          </>
        )}

        {step === "offer" && (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "linear-gradient(135deg,#7C3AED,#DB2777)", color: "white", fontSize: 12, fontWeight: 800 }}>
              <Gift size={13} />시크릿 프라이스
            </div>
            <div className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, color: "#222", marginTop: 12, lineHeight: 1.4 }}>
              떠나시기 전에,<br />다음 {PERIOD_DAYS}일을 {RETENTION_DISCOUNT_PERCENT}% 할인해 드릴게요
            </div>
            <div style={{ marginTop: 14, padding: "16px 16px", borderRadius: 14, background: "#F5F3FF", border: "1px solid #DDD6FE", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, color: "#6D28D9", fontWeight: 700 }}>{PLAN_NAME[plan]} · 다음 {PERIOD_DAYS}일</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: "#aaa", textDecoration: "line-through" }}>{won(price)}</span>
                <span className="ggk-logo" style={{ fontSize: 26, fontWeight: 800, color: "#4C1D95" }}>{won(secret)}</span>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 12, lineHeight: 1.75 }}>
              · 혜택과 기능은 지금과 똑같아요. 요금만 할인돼요.<br />
              · 다음 연장 신청 금액에 자동으로 반영돼요.<br />
              · 이 제안은 <b>한 번만</b> 드릴 수 있어요.
            </div>
            {error && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
              <button onClick={accept} disabled={busy} style={{ ...button(true, busy), background: busy ? "#d6d3c9" : "linear-gradient(135deg,#7C3AED,#DB2777)" }}>{busy ? "처리 중…" : `${RETENTION_DISCOUNT_PERCENT}% 할인받고 계속 이용하기`}</button>
              <button onClick={() => cancel(true)} disabled={busy} style={{ ...button(false, busy), border: "none", background: "transparent", fontSize: 12.5, color: "#999", textDecoration: "underline", padding: "6px 0" }}>그래도 해지할게요</button>
            </div>
          </>
        )}

        {step === "retained" && (
          <>
            <div className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, color: "#222", paddingRight: 36 }}>할인이 적용됐어요 🎁</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 10, lineHeight: 1.75 }}>
              다음 연장 신청 때 {PERIOD_DAYS}일 요금이 <b>{won(secret)}</b>으로 계산돼요.<br />
              지금 혜택은 그대로 이어져요. 계속 함께해 주셔서 감사합니다.
            </div>
            <button onClick={onClose} style={{ ...button(true), width: "100%", marginTop: 18 }}>확인</button>
          </>
        )}

        {step === "cancelled" && (
          <>
            <div className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, color: "#222", paddingRight: 36 }}>해지가 접수됐어요</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 10, lineHeight: 1.75 }}>
              <b>{expiresText}</b>까지 지금 혜택을 이용할 수 있어요.<br />
              처리 대기 중이던 연장 신청은 취소했어요.<br />
              남은 기간 요금은 담당자가 확인해 따로 안내해 드려요.<br />
              언제든 다시 신청하실 수 있어요.
            </div>
            <button onClick={onClose} style={{ ...button(true), width: "100%", marginTop: 18 }}>확인</button>
          </>
        )}
      </div>
    </div>
  );
}
