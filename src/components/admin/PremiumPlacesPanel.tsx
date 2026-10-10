"use client";

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Crown, MapPin, User, CalendarClock, Megaphone, Percent, Gift, ExternalLink } from "lucide-react";

// ── 관리자 "프리미엄" 화면의 "이용 중 가게" 탭 ──
// 프리미엄을 이용 중인(또는 이용했던) 가게를 모아 보고, 가게마다 따로 혜택을 줍니다.
//   · 기간 연장(1·3개월 무료 연장 — 프로모션·보상용)   · 프리미엄 종료
//   · 배너 광고 추가 제공(기한)   · 할인(몇 %를 몇 달)   · 메모
// 숫자·저장은 서버(/api/admin/premium-places)가 처리합니다. 결제 연동 전이라 할인·배너는 "약속한 혜택 기록"이고,
// 실제 청구 금액 반영과 배너 노출은 결제·광고 기능을 붙일 때 이 기록을 읽어 적용합니다.

type Perks = { banner_ad: boolean; banner_until: string | null; discount_percent: number; discount_months: number; free_months_granted: number; memo: string | null; updated_at?: string };
type PremiumPlace = {
  id: number; name: string; address: string | null; category: string | null; phone: string | null;
  active: boolean; expiresAt: string | null; daysLeft: number;
  owner: { email: string | null; nickname: string | null; businessName: string | null; phone: string | null } | null;
  paidMonths: number; firstApprovedAt: string | null; pendingRequests: number; perks: Perks | null;
};

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
const dateInput = (s: string | null) => (s ? new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "");

const field: React.CSSProperties = { height: 38, padding: "0 10px", borderRadius: 9, border: "1px solid #e2e4e8", fontSize: 13, fontFamily: "inherit", background: "white", boxSizing: "border-box" };
const smallBtn = (bg: string, color: string, border = "none"): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 9, border, background: bg, color, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

function PlaceCard({ place, perksReady, onChanged }: { place: PremiumPlace; perksReady: boolean; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const hasPerks = !!perks && (perks.banner_ad || perks.discount_percent > 0 || perks.free_months_granted > 0);
  const soon = place.active && place.daysLeft <= 7;

  return (
    <div style={{ background: "white", borderRadius: 18, border: `1.5px solid ${place.active ? (soon ? "#FDE68A" : "#f3d9a4") : "#e5e7eb"}`, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: place.active ? "#ffe9c2" : "#f1f2f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Crown size={16} color={place.active ? "#B8860B" : "#999"} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#111", wordBreak: "break-all" }}>{place.name}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: place.active ? (soon ? "#FEF3C7" : "#dcfce7") : "#f1f2f4", color: place.active ? (soon ? "#92400E" : "#15803d") : "#777" }}>
                {place.active ? (soon ? `만료 임박 · ${place.daysLeft}일 남음` : `이용 중 · ${place.daysLeft}일 남음`) : "만료됨"}
              </span>
              {place.pendingRequests > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#ffe9c2", color: "#92650a" }}>새 신청 {place.pendingRequests}건</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "#888", marginTop: 3, display: "flex", alignItems: "center", gap: 4, wordBreak: "break-all" }}><MapPin size={11} />{place.address || "주소 없음"}</div>
          </div>
          <a href={`/place/${place.id}`} target="_blank" rel="noreferrer" title="장소 화면 열기" style={{ flexShrink: 0, color: "#5C7A4A", padding: 4 }}><ExternalLink size={15} /></a>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
          <span style={{ fontSize: 11.5, color: "#444", background: "#f5f6f8", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarClock size={11} color="#5C7A4A" />만료 {fmt(place.expiresAt)}</span>
          <span style={{ fontSize: 11.5, color: "#444", background: "#f5f6f8", padding: "4px 10px", borderRadius: 999 }}>신청 승인 누적 {place.paidMonths}개월</span>
          {place.firstApprovedAt && <span style={{ fontSize: 11.5, color: "#444", background: "#f5f6f8", padding: "4px 10px", borderRadius: 999 }}>첫 승인 {fmt(place.firstApprovedAt)}</span>}
          <span style={{ fontSize: 11.5, color: "#444", background: "#f5f6f8", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <User size={11} color="#5C7A4A" />{place.owner ? `${place.owner.businessName || place.owner.nickname || "사장님"} · ${place.owner.email || "이메일 없음"}${place.owner.phone ? ` · ${place.owner.phone}` : ""}` : "연결된 사장님 없음"}
          </span>
        </div>

        {hasPerks && perks && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {perks.banner_ad && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#7c3aed", background: "#f3f0ff", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}><Megaphone size={11} />배너 광고 제공{perks.banner_until ? ` (~${fmt(perks.banner_until)})` : ""}</span>}
            {perks.discount_percent > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#A8551F", background: "#FBEEDD", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}><Percent size={11} />{perks.discount_percent}% 할인 · {perks.discount_months}개월</span>}
            {perks.free_months_granted > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#48603A", background: "#E4EBDC", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}><Gift size={11} />무료 연장 누적 {perks.free_months_granted}개월</span>}
          </div>
        )}
        {perks?.memo && <div style={{ marginTop: 8, fontSize: 12, color: "#666", background: "#fafafa", border: "1px solid #eee", borderRadius: 9, padding: "7px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>메모: {perks.memo}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => run({ action: "extend", months: 1 }, "1개월 연장했어요.", `"${place.name}"의 프리미엄을 1개월 무료 연장할까요?`)} style={smallBtn("#5C7A4A", "white")}>+1개월 연장</button>
          <button disabled={busy} onClick={() => run({ action: "extend", months: 3 }, "3개월 연장했어요.", `"${place.name}"의 프리미엄을 3개월 무료 연장할까요?`)} style={smallBtn("#E4EBDC", "#48603A")}>+3개월 연장</button>
          <button onClick={() => setOpen((v) => !v)} style={smallBtn("white", "#555", "1px solid #ddd")}>{open ? "혜택 설정 닫기" : "혜택 설정"}</button>
          {place.active && <button disabled={busy} onClick={() => run({ action: "end" }, "프리미엄을 종료했어요.", `"${place.name}"의 프리미엄을 지금 종료할까요?\n지도 상단 노출·추천 우대가 바로 사라져요.`)} style={smallBtn("#FEF2F2", "#b91c1c", "1px solid #FECACA")}>프리미엄 종료</button>}
        </div>
      </div>

      {open && (
        <div style={{ padding: "14px 16px 16px", background: "#fffdf7", borderTop: "1px solid #f3e7c8" }}>
          {!perksReady && (
            <div style={{ padding: "9px 11px", borderRadius: 9, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412", lineHeight: 1.6, marginBottom: 12 }}>
              혜택을 저장할 표가 아직 없어요. Supabase SQL 편집기에서 <b>scripts/sql/premium-perks.sql</b>을 실행하면 저장할 수 있어요.
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#333", cursor: "pointer" }}>
            <input type="checkbox" checked={bannerAd} onChange={(e) => setBannerAd(e.target.checked)} style={{ width: 17, height: 17 }} />
            배너 광고 추가 제공
          </label>
          {bannerAd && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#666" }}>제공 기한</span>
              <input type="date" value={bannerUntil} onChange={(e) => setBannerUntil(e.target.value)} style={field} />
              <span style={{ fontSize: 11.5, color: "#999" }}>비워 두면 프리미엄 기간 동안</span>
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
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} rows={2} placeholder="예: 오픈 초기 제휴 가게 — 첫 3개월 50% 할인 약속" style={{ ...field, height: "auto", width: "100%", padding: "9px 10px", marginTop: 8, lineHeight: 1.6, resize: "vertical" }} />

          <button
            disabled={busy}
            onClick={() => run({ action: "setPerks", bannerAd, bannerUntil: bannerAd && bannerUntil ? `${bannerUntil}T23:59:59+09:00` : null, discountPercent: Number(discountPercent) || 0, discountMonths: Number(discountMonths) || 0, memo }, "혜택을 저장했어요.")}
            style={{ ...smallBtn("#B8860B", "white"), marginTop: 12, padding: "10px 18px" }}
          >
            {busy ? "저장 중…" : "혜택 저장"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PremiumPlacesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [places, setPlaces] = useState<PremiumPlace[] | null>(null);
  const [perksReady, setPerksReady] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const json = await call("GET");
      setPlaces(json.places ?? []);
      setPerksReady(json.perksReady !== false);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setPlaces([]); }
  };
  useEffect(() => { load(); }, [refreshKey]);

  if (places === null) return <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", fontSize: 13 }}><LogoLoader /></div>;
  const active = places.filter((p) => p.active);
  const expired = places.filter((p) => !p.active);

  return (
    <div>
      {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 14 }}>{error}</div>}
      <p style={{ fontSize: 12.5, color: "#777", lineHeight: 1.65, margin: "2px 0 14px" }}>
        프리미엄 가게마다 기간을 늘려 주거나 배너 광고·할인 같은 혜택을 따로 줄 수 있어요. 결제 연동 전이라 할인·배너는 약속한 혜택을 기록해 두는 용도예요.
      </p>
      {places.length === 0 && !error && <div style={{ textAlign: "center", padding: "60px 0", color: "#888", fontSize: 13.5, fontWeight: 600 }}>아직 프리미엄을 이용한 가게가 없어요.</div>}
      {active.map((p) => <PlaceCard key={`${p.id}-${p.expiresAt}-${p.perks?.updated_at ?? ""}`} place={p} perksReady={perksReady} onChanged={load} />)}
      {expired.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: "#777", margin: "22px 0 10px" }}>만료된 가게 {expired.length}곳</div>}
      {expired.map((p) => <PlaceCard key={`${p.id}-${p.expiresAt}-${p.perks?.updated_at ?? ""}`} place={p} perksReady={perksReady} onChanged={load} />)}
    </div>
  );
}
