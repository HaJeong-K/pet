"use client";

// 숙소 입점 신청(사장님용) — 「같이가개 숙소 입점 계약서」 제5조
//   ① 내 숙소 고르기: 지도에 있는 숙소(공공데이터 숙소 포함)를 이름으로 찾아 고르거나, 없으면 직접 적기
//   ② 숙박업 영업신고증(사진·PDF) ③ 정산 계좌 ④ 입점 조건 확인·동의 → 신청
//   상태: 신청 전 → 심사 중 → 승인(입점일·프로모션 마지막 날 표시) / 반려(사유 보고 다시 신청)
// 승인 전에도 객실은 미리 올릴 수 있고, 손님 예약은 승인 뒤에 열립니다. 서버는 /api/owner/lodging/partner.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, FileUp, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BASIC_FEE_RATE, CANCEL_FEE_RATE, PREMIUM_FEE_RATE, PROMO_FEE_RATE, PROMO_MONTHS } from "@/lib/lodgingPolicy";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { PARTNER_PLACE_KEY } from "@/app/partner/lodging/PartnerStartButton";

type Partner = { status: "pending" | "approved" | "rejected"; place_name: string; place_address: string | null; place_phone: string | null; bank_name: string | null; account_holder: string | null; partner_since: string | null; promoLastDay: string | null; admin_note: string | null; requested_place_id: number | null };
type Candidate = { id: number; name: string; address: string | null; category: string | null; phone: string | null };

const BLUE = "#1D4F91";
const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #e3eaf3", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6 };
const step: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: BLUE, margin: "4px 0 -2px" };

export default function LodgingPartnerApply({ onApproved }: { onApproved?: () => void }) {
  const [state, setState] = useState<{ ready: boolean; partner: Partner | null; linkedPlaceId: number | null } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ placeName: "", placeAddress: "", placePhone: "", bankName: "", accountNumber: "", accountHolder: "" });
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    return { Authorization: `Bearer ${session.access_token}` };
  };
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/lodging/partner", { headers: await auth() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "불러오지 못했어요.");
      setState(json);
      if (json.partner?.status === "approved") onApproved?.();
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, [onApproved]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);
  // 지도에 있는 숙소 목록(공공데이터 숙소 포함) — 이름으로 찾기
  useEffect(() => { fetch("/api/lodging/list").then((r) => r.json()).then((d) => setCandidates(d.items ?? [])).catch(() => {}); }, []);
  const results = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    if (q.length < 2) return [];
    return candidates.filter((c) => `${c.name}${c.address ?? ""}`.replace(/\s+/g, "").includes(q)).slice(0, 8);
  }, [candidates, query]);
  // 이미 연결된 내 숙소, 또는 입점 안내(/partner/lodging?place=)에서 보던 숙소를 골라 둡니다
  useEffect(() => {
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(PARTNER_PLACE_KEY); } catch {}
    const linked = state?.linkedPlaceId ?? (stored ? Number(stored) : null);
    if (linked == null || picked || state?.partner) return;
    const c = candidates.find((x) => x.id === Number(linked));
    if (c) { const t = window.setTimeout(() => pick(c), 0); return () => window.clearTimeout(t); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, candidates]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const pick = (c: Candidate) => { setPicked(c); setManual(false); setQuery(""); set({ placeName: c.name, placeAddress: c.address ?? "", placePhone: c.phone ?? "" }); };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      if (picked) body.append("placeId", String(picked.id));
      for (const [k, v] of Object.entries(form)) body.append(k, v);
      body.append("agreed", agreed ? "true" : "false");
      if (file) body.append("license", file);
      const res = await fetch("/api/owner/lodging/partner", { method: "POST", headers: await auth(), body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "신청하지 못했어요.");
      setEditing(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "신청하지 못했어요."); }
    finally { setBusy(false); }
  };

  if (!state) return error ? <div style={{ ...card, fontSize: 13, color: "#666" }}>{error}</div> : null;
  if (!state.ready) return null;
  const p = state.partner;

  // 승인됨 — 짧은 안내만
  if (p?.status === "approved") {
    return (
      <div style={{ ...card, background: "#F0F7EC", borderColor: "#cfe3c3", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <BadgeCheck size={20} color="#3F6B2B" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: "#3F5230", lineHeight: 1.7 }}>
          <b>같이가개 입점 숙소예요.</b> 손님이 바로 예약할 수 있어요.<br />
          {p.partner_since && p.promoLastDay && <>입점일 {stayDayLabel(p.partner_since)} · {stayDayLabel(p.promoLastDay)} 체크인까지 수수료 {PROMO_FEE_RATE}%(이후 {BASIC_FEE_RATE}%, 프리미엄 {PREMIUM_FEE_RATE}%)</>}
        </div>
      </div>
    );
  }
  // 심사 중
  if (p?.status === "pending" && !editing) {
    return (
      <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Clock size={20} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, fontSize: 13, color: "#78350F", lineHeight: 1.7 }}>
          <b>입점 신청을 확인하고 있어요.</b> 보통 1~2영업일 걸려요.<br />
          {p.place_name}{p.place_address ? ` · ${p.place_address}` : ""}<br />
          그동안 객실과 동반 규정을 미리 올려 두면, 승인되는 날 바로 예약을 받을 수 있어요.
          <div><button onClick={() => { setEditing(true); set({ placeName: p.place_name, placeAddress: p.place_address ?? "", placePhone: p.place_phone ?? "", bankName: p.bank_name ?? "", accountHolder: p.account_holder ?? "" }); }} style={{ marginTop: 6, border: "none", background: "transparent", padding: 0, color: "#92400E", fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>신청 내용 고치기</button></div>
        </div>
      </div>
    );
  }

  const canSubmit = !!form.placeName.trim() && !!form.bankName.trim() && form.accountNumber.replace(/\D/g, "").length >= 8 && !!form.accountHolder.trim() && agreed && (!!file || !!p) && !busy;
  return (
    <div style={card}>
      <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>같이가개 숙소 입점 신청</div>
      <div style={{ fontSize: 12.5, color: "#555", marginTop: 5, lineHeight: 1.7 }}>
        반려동물과 여행하는 손님만 모이는 숙소 예약 서비스예요.<br />
        숙소 근처의 동반 카페·식당·공원까지 함께 보여 줘서, 손님이 머무는 동안 즐길 거리를 바로 찾을 수 있어요.
      </div>
      {p?.status === "rejected" && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", color: "#b91c1c", fontSize: 12.5, lineHeight: 1.6 }}>지난 신청이 반려됐어요{p.admin_note ? ` — ${p.admin_note}` : ""}. 고쳐서 다시 신청해 주세요.</div>}

      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <div style={step}>1. 내 숙소 고르기</div>
        {picked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#E3EDFA" }}>
            <CheckCircle2 size={16} color={BLUE} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><b>{picked.name}</b><div style={{ fontSize: 12, color: "#555" }}>{[picked.category, picked.address].filter(Boolean).join(" · ")}</div></div>
            <button onClick={() => setPicked(null)} style={{ border: "none", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>다시 고르기</button>
          </div>
        ) : !manual ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
              <Search size={15} color="#999" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="숙소 이름으로 찾기(2글자 이상)" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit" }} />
            </div>
            {results.length > 0 && (
              <div style={{ marginTop: 6, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                {results.map((c) => (
                  <button key={c.id} onClick={() => pick(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: "1px solid #f2f2f2", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
                    <b style={{ fontSize: 13 }}>{c.name}</b> <span style={{ fontSize: 12, color: "#5c5c5c" }}>{[c.category, c.address].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setManual(true)} style={{ marginTop: 6, border: "none", background: "transparent", padding: 0, color: BLUE, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>지도에 내 숙소가 없어요</button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#5c5c5c" }}>지도에 없는 숙소는 같이가개가 확인한 뒤 지도에 등록해 드려요.</div>
        )}
        {(picked || manual) && (
          <div style={{ display: "grid", gap: 8 }}>
            <input value={form.placeName} onChange={(e) => set({ placeName: e.target.value })} placeholder="숙소 이름" style={input} />
            <input value={form.placeAddress} onChange={(e) => set({ placeAddress: e.target.value })} placeholder="주소" style={input} />
            <input value={form.placePhone} onChange={(e) => set({ placePhone: e.target.value })} placeholder="예약 문의 전화" inputMode="tel" style={input} />
          </div>
        )}

        <div style={step}>2. 숙박업 영업신고증</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, border: "1.5px dashed #9db4d6", background: "#F2F6FC", color: BLUE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <FileUp size={16} />{file ? file.name : p ? "새로 올리기(안 올리면 지난번 파일 사용)" : "사진이나 PDF 올리기"}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
        </label>
        <div style={{ fontSize: 11.5, color: "#666", marginTop: -6 }}>숙박업·농어촌민박업·관광숙박업·야영장업 등 영업 신고(등록)증. 관리자만 볼 수 있게 보관해요.</div>

        <div style={step}>3. 정산받을 계좌</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="은행" style={input} />
          <input value={form.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} placeholder="예금주" style={input} />
        </div>
        <input value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value.replace(/[^\d-]/g, "") })} placeholder="계좌번호" inputMode="numeric" style={input} />
        <div style={{ fontSize: 11.5, color: "#666", marginTop: -6 }}>사업자 명의 계좌로 적어 주세요. 이용 확정 다음 영업일에 이 계좌로 정산해 드려요.</div>

        <div style={step}>4. 입점 조건</div>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F7F3E8", fontSize: 12.5, color: "#444", lineHeight: 1.8 }}>
          · 수수료: 입점일부터 {PROMO_MONTHS}개월 <b>{PROMO_FEE_RATE}%</b>, 이후 {BASIC_FEE_RATE}% (숙소 프리미엄 이용 중에는 {PREMIUM_FEE_RATE}%)<br />
          · 광고비·가입비·쿠폰 비용 없음<br />
          · 손님은 예약할 때 전액 결제, 이용 확정 다음 영업일에 수수료를 뺀 금액 정산<br />
          · 취소·환불은 공정위 소비자분쟁해결기준(숙박업)을 따름. 위약금에는 취소 정산 수수료 {CANCEL_FEE_RATE}%<br />
          · 숙소 사정 취소·동반 조건과 다른 입실 거부는 손님에게 전액 환불 + 배상<br />
          · 계약 조건을 바꿀 때는 30일 전에 알려 드리고, 동의하지 않으면 위약금 없이 해지할 수 있음
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#444", lineHeight: 1.6, cursor: "pointer" }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 16, height: 16, marginTop: 3 }} />
          <span>위 조건을 포함한 <a href="/partner/lodging#terms" target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700 }}>같이가개 숙소 입점 계약서</a>에 동의해요.</span>
        </label>

        {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
        <button onClick={submit} disabled={!canSubmit} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: canSubmit ? BLUE : "#d6d3c9", color: "white", fontSize: 15, fontWeight: 800, cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit" }}>{busy ? "신청하는 중…" : "입점 신청하기"}</button>
      </div>
    </div>
  );
}
