"use client";

import LogoLoader from "@/components/LogoLoader";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Crown, MapPin, User, CalendarClock, Megaphone, Percent, Gift, ExternalLink, Minus, Plus, History } from "lucide-react";
import { PLAN_MONTHLY_PRICE, PLAN_NAME, won, type PaidPlanId } from "@/lib/ownerPlans";
import { adjustExpiry, PREMIUM_ADJUST_DAYS_MAX } from "@/lib/premiumPeriod";

// ── 관리자 "프리미엄" 화면의 "이용 중 가게" 탭 ──
// 프리미엄을 이용 중인(또는 이용했던) 가게를 모아 보고, 가게마다 따로 관리합니다.
//   · 이용 기간: "− 일수 +"로 며칠 늘리거나 줄이기(줄여서 오늘 이전이 되면 종료), 개월 단위 무료 연장, 바로 종료
//   · 요금제 단계 바꾸기(프리미엄 / 프리미엄 스토어 / 동네 대표)
//   · 배너 광고: 지금 나가는지와 이유(요금제·혜택), 그 동네에서 배너를 내는 가게 수
//   · 혜택: 배너 추가 제공(기한) · 할인(몇 %를 몇 달) · 메모
//   · 변경 기록: 누가 언제 무엇을 바꿨는지
// 숫자·저장은 서버(/api/admin/premium-places)가 처리합니다. 결제 연동 전이라 할인은 "약속한 혜택 기록"입니다(배너는 실제로 노출됩니다).

type Perks = { banner_ad: boolean; banner_until: string | null; discount_percent: number; discount_months: number; free_months_granted: number; memo: string | null; updated_at?: string };
type Change = { action: string; detail: string | null; changed_by: string | null; created_at: string };
type PremiumPlace = {
  id: number; name: string; address: string | null; category: string | null; phone: string | null;
  active: boolean; expiresAt: string | null; daysLeft: number;
  plan: PaidPlanId; banner: "plan" | "perk" | null; bannerRegion: string;
  owner: { email: string | null; nickname: string | null; businessName: string | null; phone: string | null } | null;
  paidMonths: number; firstApprovedAt: string | null; pendingRequests: number; perks: Perks | null; changes: Change[];
};
type PanelData = { places: PremiumPlace[]; perksReady: boolean; planReady: boolean; historyReady: boolean; bannerRegions: { region: string; names: string[] }[] };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/premium-places", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }) : "-");
const fmtTime = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const dateInput = (s: string | null) => (s ? new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "");

const field: React.CSSProperties = { height: 38, padding: "0 10px", borderRadius: 9, border: "1px solid #e2e4e8", fontSize: 13, fontFamily: "inherit", background: "white", boxSizing: "border-box" };
const smallBtn = (bg: string, color: string, border = "none"): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 9, border, background: bg, color, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 700, color, background: bg, padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 });
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#655a3c", letterSpacing: "0.2px", marginBottom: 7 };
const section: React.CSSProperties = { padding: "13px 16px", borderTop: "1px solid #f3ecd9" };
const PLAN_COLOR: Record<PaidPlanId, { bg: string; color: string }> = { premium: { bg: "#ffe9c2", color: "#92650a" }, store: { bg: "#DBEAFE", color: "#1D4ED8" }, local: { bg: "#f3e8ff", color: "#7c3aed" } };
const DAY_PRESETS = [1, 7, 30, 90];
const CHANGE_LABEL: Record<string, string> = { extend: "연장", shorten: "단축", end: "종료", plan: "요금제", perks: "혜택", approve: "신청 승인" };

function PlaceCard({ place, data, onChanged }: { place: PremiumPlace; data: PanelData; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState("7");
  const [plan, setPlan] = useState<PaidPlanId>(place.plan);
  const [bannerAd, setBannerAd] = useState(place.perks?.banner_ad ?? false);
  const [bannerUntil, setBannerUntil] = useState(dateInput(place.perks?.banner_until ?? null));
  const [discountPercent, setDiscountPercent] = useState(String(place.perks?.discount_percent ?? 0));
  const [discountMonths, setDiscountMonths] = useState(String(place.perks?.discount_months ?? 0));
  const [memo, setMemo] = useState(place.perks?.memo ?? "");

  const run = async (body: Record<string, unknown>, done: string, confirmText?: string) => {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try { await call("POST", { placeId: place.id, ...body }); await onChanged(); alert(done); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  };

  const perks = place.perks;
  const soon = place.active && place.daysLeft <= 7;
  const dayCount = Math.max(0, Math.min(PREMIUM_ADJUST_DAYS_MAX, Math.round(Number(days) || 0)));
  // 누르기 전에 결과를 미리 계산해 보여 줍니다(서버와 같은 계산).
  const preview = (sign: 1 | -1) => (dayCount > 0 ? adjustExpiry(place.expiresAt, sign * dayCount) : null);
  const plus = preview(1), minus = preview(-1);
  const adjust = (sign: 1 | -1) => {
    const result = sign === 1 ? plus : minus;
    if (!result) { alert("날짜 수를 1 이상으로 적어 주세요."); return; }
    if ("error" in result) { alert(result.error); return; }
    const text = result.ended
      ? `"${place.name}"의 이용 기간을 ${dayCount}일 줄이면 남은 기간이 없어 프리미엄이 바로 종료돼요.\n계속할까요?`
      : `"${place.name}"의 이용 기간을 ${dayCount}일 ${sign === 1 ? "늘릴" : "줄일"}까요?\n만료일: ${fmt(place.expiresAt)} → ${fmt(result.expiresAt)}`;
    run({ action: "adjustDays", days: sign * dayCount }, result.ended ? "프리미엄을 종료했어요." : `만료일을 ${fmt(result.expiresAt)}로 바꿨어요.`, text);
  };
  const regionUsed = data.bannerRegions.find((r) => r.region === place.bannerRegion)?.names.length ?? 0;

  return (
    <div style={{ background: "white", borderRadius: 18, border: `1.5px solid ${place.active ? (soon ? "#FDE68A" : "#f3d9a4") : "#e5e7eb"}`, marginBottom: 14, overflow: "hidden" }}>
      {/* 머리: 가게 이름·상태·요금제 */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: place.active ? "#ffe9c2" : "#f1f2f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Crown size={16} color={place.active ? "#B8860B" : "#999"} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#111", wordBreak: "break-all" }}>{place.name}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: place.active ? (soon ? "#FEF3C7" : "#dcfce7") : "#f1f2f4", color: place.active ? (soon ? "#92400E" : "#15803d") : "#555" }}>
                {place.active ? (soon ? `만료 임박 · ${place.daysLeft}일 남음` : `이용 중 · ${place.daysLeft}일 남음`) : "만료됨"}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: PLAN_COLOR[place.plan].bg, color: PLAN_COLOR[place.plan].color }}>{PLAN_NAME[place.plan]}</span>
              {place.pendingRequests > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#ffe9c2", color: "#92650a" }}>새 신청 {place.pendingRequests}건</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 3, display: "flex", alignItems: "center", gap: 4, wordBreak: "break-all" }}><MapPin size={11} />{place.address || "주소 없음"}</div>
          </div>
          <a href={`/place/${place.id}`} target="_blank" rel="noreferrer" title="장소 화면 열기" style={{ flexShrink: 0, color: "#5C7A4A", padding: 4 }}><ExternalLink size={15} /></a>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
          <span style={chip("#f5f6f8", "#444")}><User size={11} color="#5C7A4A" />{place.owner ? `${place.owner.businessName || place.owner.nickname || "사장님"} · ${place.owner.email || "이메일 없음"}${place.owner.phone ? ` · ${place.owner.phone}` : ""}` : "연결된 사장님 없음"}</span>
          <span style={chip("#f5f6f8", "#444")}>신청 승인 누적 {place.paidMonths}개월</span>
          {place.firstApprovedAt && <span style={chip("#f5f6f8", "#444")}>첫 승인 {fmt(place.firstApprovedAt)}</span>}
          {perks && perks.discount_percent > 0 && <span style={chip("#FBEEDD", "#A8551F")}><Percent size={11} />{perks.discount_percent}% 할인 · {perks.discount_months}개월</span>}
          {perks && perks.free_months_granted > 0 && <span style={chip("#E4EBDC", "#48603A")}><Gift size={11} />무료 연장 누적 {perks.free_months_granted}개월</span>}
        </div>
        {perks?.memo && <div style={{ marginTop: 8, fontSize: 12, color: "#666", background: "#fafafa", border: "1px solid #eee", borderRadius: 9, padding: "7px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>메모: {perks.memo}</div>}
      </div>

      {/* 이용 기간 */}
      <div style={section}>
        <div style={sectionTitle}>이용 기간</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={chip("#f5f6f8", "#333")}><CalendarClock size={11} color="#5C7A4A" />만료 {fmt(place.expiresAt)}</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: "1px solid #ddd", overflow: "hidden", background: "white" }}>
            <button disabled={busy || !place.active} onClick={() => adjust(-1)} aria-label={`${dayCount}일 줄이기`} title={place.active ? `${dayCount}일 줄이기` : "이미 끝난 프리미엄은 줄일 수 없어요"} style={{ width: 40, height: 38, border: "none", background: place.active ? "#fff5f5" : "#f5f5f5", color: place.active ? "#dc2626" : "#707070", cursor: place.active ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={15} /></button>
            <input type="number" min={1} max={PREMIUM_ADJUST_DAYS_MAX} value={days} onChange={(e) => setDays(e.target.value)} aria-label="조절할 날짜 수" style={{ width: 62, height: 38, border: "none", borderLeft: "1px solid #eee", textAlign: "right", fontSize: 14, fontWeight: 800, fontFamily: "inherit", padding: "0 2px 0 6px", boxSizing: "border-box" }} />
            <span style={{ height: 38, lineHeight: "38px", fontSize: 13, color: "#666", padding: "0 10px 0 2px", borderRight: "1px solid #eee" }}>일</span>
            <button disabled={busy} onClick={() => adjust(1)} aria-label={`${dayCount}일 늘리기`} title={`${dayCount}일 늘리기`} style={{ width: 40, height: 38, border: "none", background: "#f0fdf4", color: "#15803d", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={15} /></button>
          </div>
          <div style={{ display: "inline-flex", gap: 4 }}>
            {DAY_PRESETS.map((n) => (
              <button key={n} onClick={() => setDays(String(n))} style={{ padding: "6px 9px", borderRadius: 8, border: `1px solid ${dayCount === n ? "#B8860B" : "#e2e4e8"}`, background: dayCount === n ? "#fff8ec" : "white", color: dayCount === n ? "#92650a" : "#666", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{n}일</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#666", marginTop: 7, lineHeight: 1.6 }}>
          {dayCount > 0 && plus && !("error" in plus) && <>+ 누르면 만료 <b style={{ color: "#15803d" }}>{fmt(plus.expiresAt)}</b></>}
          {dayCount > 0 && place.active && minus && !("error" in minus) && <> · − 누르면 {minus.ended ? <b style={{ color: "#dc2626" }}>바로 종료</b> : <>만료 <b style={{ color: "#dc2626" }}>{fmt(minus.expiresAt)}</b></>}</>}
          {!place.active && <> · 끝난 가게는 + 를 누르면 오늘부터 다시 시작해요</>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => run({ action: "extend", months: 1 }, "1개월 연장했어요.", `"${place.name}"의 프리미엄을 1개월 무료 연장할까요?`)} style={smallBtn("#5C7A4A", "white")}>+1개월 무료 연장</button>
          <button disabled={busy} onClick={() => run({ action: "extend", months: 3 }, "3개월 연장했어요.", `"${place.name}"의 프리미엄을 3개월 무료 연장할까요?`)} style={smallBtn("#E4EBDC", "#48603A")}>+3개월 무료 연장</button>
          {place.active && <button disabled={busy} onClick={() => run({ action: "end" }, "프리미엄을 종료했어요.", `"${place.name}"의 프리미엄을 지금 종료할까요?\n지도 상단 노출·추천 우대·배너·상품 예약이 바로 사라져요.`)} style={{ ...smallBtn("#fff5f5", "#dc2626", "1px solid #fecaca"), marginLeft: "auto" }}>지금 종료</button>}
        </div>
      </div>

      {/* 요금제 */}
      <div style={section}>
        <div style={sectionTitle}>요금제</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={plan} onChange={(e) => setPlan(e.target.value as PaidPlanId)} disabled={!data.planReady} style={{ ...field, minWidth: 210 }}>
            {(["premium", "store", "local"] as PaidPlanId[]).map((id) => <option key={id} value={id}>{PLAN_NAME[id]} · 월 {won(PLAN_MONTHLY_PRICE[id])}</option>)}
          </select>
          <button disabled={busy || plan === place.plan || !data.planReady} onClick={() => run({ action: "setPlan", plan }, `요금제를 ${PLAN_NAME[plan]}(으)로 바꿨어요.`, `"${place.name}"의 요금제를 ${PLAN_NAME[place.plan]} → ${PLAN_NAME[plan]}(으)로 바꿀까요?`)} style={{ ...smallBtn(plan === place.plan ? "#eee" : "#B8860B", plan === place.plan ? "#aaa" : "white"), cursor: plan === place.plan ? "default" : "pointer" }}>요금제 바꾸기</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#666", marginTop: 7, lineHeight: 1.6 }}>
          {data.planReady
            ? "프리미엄: 목록 위 노출·AI 코스 / 프리미엄 스토어: + 상품·예약 포장 / 동네 대표: + 배너 광고. 기간은 그대로 두고 단계만 바뀌어요."
            : <>요금제 단계를 저장할 칸이 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/owner-store.sql</b>을 실행해 주세요.</>}
        </div>
      </div>

      {/* 배너 광고 */}
      <div style={section}>
        <div style={sectionTitle}>배너 광고</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {place.banner
            ? <span style={chip("#f3f0ff", "#7c3aed")}><Megaphone size={11} />노출 중 · {place.banner === "plan" ? "동네 대표 요금제" : `관리자 혜택${perks?.banner_until ? `(~${fmt(perks.banner_until)})` : ""}`}</span>
            : <span style={chip("#f1f2f4", "#777")}><Megaphone size={11} />노출 안 함</span>}
          <span style={chip("#f5f6f8", "#444")}>{place.bannerRegion} · 배너 가게 {regionUsed}곳</span>
          <button onClick={() => setOpen((v) => !v)} style={{ ...smallBtn("white", "#555", "1px solid #ddd"), marginLeft: "auto" }}>{open ? "혜택 설정 닫기" : "혜택 설정(배너·할인·메모)"}</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#666", marginTop: 7, lineHeight: 1.6 }}>
          {place.bannerRegion} 사용자의 커뮤니티·마이페이지에 보여요(PC 양옆 2자리, 휴대폰 위쪽 1자리). 같은 동네에 여러 곳이면 모든 가게가 같은 횟수만큼 나가도록 돌아가며 보여 줘요.
        </div>
      </div>

      {open && (
        <div style={{ padding: "14px 16px 16px", background: "#fffdf7", borderTop: "1px solid #f3e7c8" }}>
          {!data.perksReady && (
            <div style={{ padding: "9px 11px", borderRadius: 9, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412", lineHeight: 1.6, marginBottom: 12 }}>
              혜택을 저장할 표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/premium-perks.sql</b>을 실행하면 저장할 수 있어요.
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#333", cursor: "pointer" }}>
            <input type="checkbox" checked={bannerAd} onChange={(e) => setBannerAd(e.target.checked)} style={{ width: 17, height: 17 }} />
            배너 광고 추가 제공(동네 대표 요금제가 아니어도 배너에 노출)
          </label>
          {bannerAd && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#666" }}>제공 기한</span>
              <input type="date" value={bannerUntil} onChange={(e) => setBannerUntil(e.target.value)} style={field} />
              <span style={{ fontSize: 11.5, color: "#666" }}>비워 두면 프리미엄 기간 동안</span>
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginTop: 14 }}>요금 할인</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} style={{ ...field, width: 80 }} />
            <span style={{ fontSize: 12.5, color: "#555" }}>% 할인을</span>
            <input type="number" min={0} max={36} value={discountMonths} onChange={(e) => setDiscountMonths(e.target.value)} style={{ ...field, width: 80 }} />
            <span style={{ fontSize: 12.5, color: "#555" }}>개월 동안</span>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginTop: 14 }}>메모</div>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} rows={2} placeholder="예: 오픈 초기 제휴 가게 — 첫 3개월 50% 할인 약속" style={{ ...field, height: "auto", width: "100%", padding: "9px 10px", marginTop: 8, resize: "vertical", lineHeight: 1.5 }} />

          <button
            disabled={busy}
            onClick={() => run({ action: "setPerks", bannerAd, bannerUntil: bannerAd && bannerUntil ? `${bannerUntil}T23:59:59+09:00` : null, discountPercent: Number(discountPercent) || 0, discountMonths: Number(discountMonths) || 0, memo }, "혜택을 저장했어요.")}
            style={{ ...smallBtn("#B8860B", "white"), marginTop: 12, padding: "10px 18px" }}
          >
            {busy ? "저장 중…" : "혜택 저장"}
          </button>
        </div>
      )}

      {/* 변경 기록 */}
      {(place.changes.length > 0 || !data.historyReady) && (
        <div style={{ ...section, background: "#fcfcfb" }}>
          <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 4 }}><History size={11} />최근 변경 기록</div>
          {!data.historyReady && <div style={{ fontSize: 11.5, color: "#666" }}>scripts/sql/owner-store.sql을 실행하면 누가 언제 바꿨는지 여기에 남아요.</div>}
          <div style={{ display: "grid", gap: 4 }}>
            {place.changes.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "#555", lineHeight: 1.5, flexWrap: "wrap" }}>
                <span style={{ color: "#6e6e6e", flexShrink: 0 }}>{fmtTime(c.created_at)}</span>
                <b style={{ flexShrink: 0, color: c.action === "end" || c.action === "shorten" ? "#dc2626" : "#333" }}>{CHANGE_LABEL[c.action] ?? c.action}</b>
                <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{c.detail}</span>
                <span style={{ color: "#707070" }}>{c.changed_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PremiumPlacesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await call("GET");
      setData({
        places: json.places ?? [], perksReady: json.perksReady !== false, planReady: json.planReady !== false, historyReady: json.historyReady !== false,
        bannerRegions: json.bannerRegions ?? [],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      setData((prev) => prev ?? { places: [], perksReady: true, planReady: true, historyReady: true, bannerRegions: [] });
    }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load, refreshKey]);

  if (data === null) return <div style={{ textAlign: "center", padding: "60px 0", color: "#707070", fontSize: 13 }}><LogoLoader /></div>;
  const { places } = data;
  const active = places.filter((p) => p.active);
  const expired = places.filter((p) => !p.active);
  const soon = active.filter((p) => p.daysLeft <= 7).length;
  const banners = active.filter((p) => p.banner).length;
  const monthly = active.reduce((sum, p) => sum + PLAN_MONTHLY_PRICE[p.plan], 0);
  const summary: { label: string; value: string; color: string }[] = [
    { label: "이용 중", value: `${active.length}곳`, color: "#15803d" },
    { label: "7일 안에 만료", value: `${soon}곳`, color: soon > 0 ? "#b45309" : "#555" },
    { label: "배너 노출", value: `${banners}곳`, color: "#7c3aed" },
    { label: "정가 기준 월 합계", value: won(monthly), color: "#333" },
  ];
  const cardKey = (p: PremiumPlace) => `${p.id}-${p.expiresAt}-${p.plan}-${p.perks?.updated_at ?? ""}`;

  return (
    <div>
      {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 14 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, margin: "2px 0 12px" }}>
        {summary.map((s) => (
          <div key={s.label} style={{ background: "white", borderRadius: 14, border: "1px solid #ece6d6", padding: "11px 13px" }}>
            <div style={{ fontSize: 11.5, color: "#5c5c5c", fontWeight: 600 }}>{s.label}</div>
            <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "white", borderRadius: 14, border: "1px solid #ece6d6", padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#333", display: "flex", alignItems: "center", gap: 5 }}><Megaphone size={13} color="#7c3aed" />동네별 배너 가게</div>
        {data.bannerRegions.length === 0
          ? <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>지금 배너를 내는 가게가 없어요. 가게를 &lsquo;동네 대표&rsquo; 요금제로 바꾸거나 혜택 설정에서 배너를 켜면 그 동네 사용자에게 보여요.</div>
          : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {data.bannerRegions.map((r) => (
                <span key={r.region} title={r.names.join(", ")} style={chip("#f3f0ff", "#6d28d9")}>
                  {r.region} {r.names.length}곳 · {r.names.join(", ")}
                </span>
              ))}
            </div>
          )}
      </div>

      {places.length === 0 && !error && <div style={{ textAlign: "center", padding: "60px 0", color: "#5c5c5c", fontSize: 13.5, fontWeight: 600 }}>아직 프리미엄을 이용한 가게가 없어요.</div>}
      {active.map((p) => <PlaceCard key={cardKey(p)} place={p} data={data} onChanged={load} />)}
      {expired.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: "#555", margin: "22px 0 10px" }}>만료된 가게 {expired.length}곳</div>}
      {expired.map((p) => <PlaceCard key={cardKey(p)} place={p} data={data} onChanged={load} />)}
    </div>
  );
}
