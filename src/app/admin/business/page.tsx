"use client";

// ── 사업성(손익분기) 계산 ──
// 심사 의견 "개발 비용 대비 수익성을 확보하기 위한 최소 매출액 계산이 필요"에 대한 답을 숫자로 만드는 화면입니다.
// 매달 드는 비용과 사장님 요금제(정가, src/lib/ownerPlans.ts)를 넣으면, 손익분기에 필요한 유료 가게 수와 가게 수별 이익을 보여 줍니다.
// 입력값은 이 기기에만 기억합니다(사업계획서에 옮겨 적는 계산기 용도). 계산 규칙은 src/lib/breakEven.ts.

import { useEffect, useMemo, useState } from "react";
import AdminNav from "@/components/AdminNav";
import { Calculator, RotateCcw } from "lucide-react";
import { PLAN_MONTHLY_PRICE, PLAN_NAME, won } from "@/lib/ownerPlans";
import { breakEven, DEFAULT_COSTS, DEFAULT_MIX, scenarioRows, type CostItem, type PlanMix } from "@/lib/breakEven";

const STORAGE_KEY = "ggk_business_calc_v1";
type Saved = { costs: CostItem[]; mix: PlanMix; fee: number; other: number; prices: typeof PLAN_MONTHLY_PRICE };
const defaults = (): Saved => ({ costs: DEFAULT_COSTS.map((c) => ({ ...c })), mix: { ...DEFAULT_MIX }, fee: 3.3, other: 0, prices: { ...PLAN_MONTHLY_PRICE } });
const SCENARIOS = [10, 30, 50, 100, 200, 500];

const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "16px 18px" };
const numInput: React.CSSProperties = { width: 120, padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: "inherit", boxSizing: "border-box" };
const label: React.CSSProperties = { fontSize: 13, color: "#333", fontWeight: 600 };
const toNum = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;

export default function AdminBusiness() {
  const [state, setState] = useState<Saved>(defaults);

  // 이 기기에 저장해 둔 값이 있으면 불러옵니다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (saved?.costs) setState({ ...defaults(), ...saved }); } catch { /* 처음 값으로 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const update = (next: Saved) => {
    setState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 계산은 됩니다 */ }
  };

  const result = useMemo(() => breakEven(state.costs, state.prices, state.mix, state.fee, state.other), [state]);
  const rows = scenarioRows(SCENARIOS, result, state.other);
  const mixTotal = state.mix.premium + state.mix.store + state.mix.local;

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="business" />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", display: "grid", gap: 14, wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Calculator size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>사업성 계산 (손익분기)</div>
          <button onClick={() => update(defaults())} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, border: "1px solid #ddd", background: "white", fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}><RotateCcw size={12} />처음 값으로</button>
        </div>
        <div style={{ fontSize: 12.5, color: "#555", lineHeight: 1.7 }}>
          매달 드는 비용을 사장님 요금제 매출로 메우려면 유료 가게가 몇 곳 필요한지 계산합니다.<br />
          첫 달 무료·2~3개월째 50% 할인 기간은 빼고 정가 기준으로 봅니다. 입력값은 이 기기에만 저장돼요.
        </div>

        {/* 결과 */}
        <div style={{ ...card, background: "#2f3a26", border: "none", color: "white", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>손익분기 유료 가게 수</div>
            <div className="ggk-logo" style={{ fontSize: 32, fontWeight: 800, color: "#FFE9A8", fontVariantNumeric: "tabular-nums" }}>{result.shopsNeeded == null ? "-" : `${result.shopsNeeded.toLocaleString("ko-KR")}곳`}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>필요한 월 매출(최소 매출액)</div>
            <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{result.revenueNeeded == null ? "-" : won(Math.round(result.revenueNeeded))}</div>
            <div style={{ fontSize: 11.5, opacity: 0.7 }}>연 {result.revenueNeeded == null ? "-" : won(Math.round(result.revenueNeeded * 12))}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>월 운영비 합계</div>
            <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{won(result.monthlyCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>가게 1곳 평균 월 요금</div>
            <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{won(Math.round(result.arpu))}</div>
            <div style={{ fontSize: 11.5, opacity: 0.7 }}>수수료 뺀 실수령 {won(Math.round(result.netArpu))}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {/* 운영비 */}
          <div style={card}>
            <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#222", marginBottom: 10 }}>월 운영비</div>
            <div style={{ display: "grid", gap: 8 }}>
              {state.costs.map((c, i) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={label}>{c.label}</span>
                    {c.note && <span style={{ display: "block", fontSize: 11, color: "#666" }}>{c.note}</span>}
                  </span>
                  <input id={`cost-${c.id}`} inputMode="numeric" value={c.monthly.toLocaleString("ko-KR")} onChange={(e) => update({ ...state, costs: state.costs.map((x, j) => (j === i ? { ...x, monthly: toNum(e.target.value) } : x)) })} style={numInput} />
                  <span style={{ fontSize: 12, color: "#5c5c5c" }}>원</span>
                </label>
              ))}
            </div>
          </div>

          {/* 요금제 */}
          <div style={card}>
            <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#222", marginBottom: 10 }}>요금제와 가입 비율</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(["premium", "store", "local"] as const).map((id) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...label, flex: "1 1 110px" }}>{PLAN_NAME[id]}</span>
                  <input id={`price-${id}`} inputMode="numeric" aria-label={`${PLAN_NAME[id]} 월 요금`} value={state.prices[id].toLocaleString("ko-KR")} onChange={(e) => update({ ...state, prices: { ...state.prices, [id]: toNum(e.target.value) } })} style={{ ...numInput, width: 100 }} />
                  <span style={{ fontSize: 12, color: "#5c5c5c" }}>원 ·</span>
                  <input id={`mix-${id}`} inputMode="numeric" aria-label={`${PLAN_NAME[id]} 비율`} value={state.mix[id]} onChange={(e) => update({ ...state, mix: { ...state.mix, [id]: toNum(e.target.value) } })} style={{ ...numInput, width: 60 }} />
                  <span style={{ fontSize: 12, color: "#5c5c5c" }}>%</span>
                </div>
              ))}
              {mixTotal !== 100 && <div style={{ fontSize: 11.5, color: "#B45309" }}>비율 합이 {mixTotal}%예요. 비율대로 나눠 계산합니다.</div>}
              <div style={{ height: 1, background: "#f1efe6", margin: "4px 0" }} />
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}><span style={label}>결제 수수료</span><span style={{ display: "block", fontSize: 11, color: "#666" }}>카드 결제대행 등(계좌 입금이면 0)</span></span>
                <input id="fee" inputMode="decimal" value={state.fee} onChange={(e) => update({ ...state, fee: toNum(e.target.value) })} style={{ ...numInput, width: 70 }} />
                <span style={{ fontSize: 12, color: "#5c5c5c" }}>%</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}><span style={label}>그 밖의 월 매출</span><span style={{ display: "block", fontSize: 11, color: "#666" }}>브랜드 협업·제휴 등(없으면 0)</span></span>
                <input id="other" inputMode="numeric" value={state.other.toLocaleString("ko-KR")} onChange={(e) => update({ ...state, other: toNum(e.target.value) })} style={numInput} />
                <span style={{ fontSize: 12, color: "#5c5c5c" }}>원</span>
              </label>
            </div>
          </div>
        </div>

        {/* 가게 수별 */}
        <div style={card}>
          <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#222", marginBottom: 10 }}>유료 가게 수별 월 이익</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
              <thead><tr style={{ color: "#5c5c5c", fontSize: 12, textAlign: "right" }}><th style={{ textAlign: "left", padding: "6px 8px" }}>유료 가게</th><th style={{ padding: "6px 8px" }}>월 매출</th><th style={{ padding: "6px 8px" }}>월 이익</th><th style={{ padding: "6px 8px" }}>연 이익</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.shops} style={{ borderTop: "1px solid #f1efe6", textAlign: "right", background: result.shopsNeeded != null && r.shops >= result.shopsNeeded && (rows.find((x) => x.shops >= result.shopsNeeded!)?.shops === r.shops) ? "#F3F8EE" : undefined }}>
                    <td style={{ textAlign: "left", padding: "8px", fontWeight: 700 }}>{r.shops.toLocaleString("ko-KR")}곳</td>
                    <td style={{ padding: "8px" }}>{won(Math.round(r.revenue))}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: r.profit >= 0 ? "#3F6B2B" : "#B91C1C" }}>{r.profit >= 0 ? "" : "−"}{won(Math.abs(Math.round(r.profit)))}</td>
                    <td style={{ padding: "8px", color: r.profit >= 0 ? "#3F6B2B" : "#B91C1C" }}>{r.profit >= 0 ? "" : "−"}{won(Math.abs(Math.round(r.profit * 12)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: "#666", marginTop: 8, lineHeight: 1.6 }}>
            사업계획서에는 &ldquo;월 운영비 {won(result.monthlyCost)} 기준, 유료 가게 {result.shopsNeeded ?? "-"}곳(월 매출 {result.revenueNeeded == null ? "-" : won(Math.round(result.revenueNeeded))})에서 손익분기&rdquo;처럼 옮겨 적으면 됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
