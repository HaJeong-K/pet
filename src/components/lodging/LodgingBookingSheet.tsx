"use client";

// 숙박 예약 창(손님용) — 장소 상세의 숙소 칸(PlaceLodgingSection)에서 객실의 [예약하기]로 엽니다.
//   ① 날짜·인원·반려동물: 객실 달력에서 체크인 → 체크아웃을 고릅니다(막은 날·찬 날은 못 고름).
//      반려동물은 한 마리씩 종류(숙소가 받는 동물만 — 강아지·고양이·그 외 동물) → 견종·묘종(BreedPicker: 검색·목록) → 크기·몸무게를 적고,
//      숙소 동반 규정에 안 맞으면 바로 알려 줍니다.
//      고르는 동안 객실·인원 추가·반려동물 추가·부가 옵션을 합친 금액을 바로 보여 줍니다(현장에서 낼 금액 없음).
//   ② 확인: 1박씩 나눈 요금, 추억 스탬프 할인, 날짜별 환불 안내(소비자분쟁해결기준),
//      예약자(이름·휴대전화 필수, 이메일 선택)·실제 이용자(예약자와 다르면 필수)·방문 수단(필수)·도착 예정 시각·요청 사항,
//      필수 동의(이용 규칙·취소 환불 / 개인정보 수집·이용 / 숙소에 제공 / 만 14세 이상 — src/lib/lodgingConsents.ts) → 예약
//   ③ 완료: 숙소 확정을 기다리거나(24시간), 즉시 확정 숙소면 바로 확정
// variant="page"면 덮는 창 없이 숙소 예약 화면(/stay/번호/book)에 그대로 그립니다.
// 금액은 서버가 다시 계산합니다(/api/lodging/bookings). 결제 키가 있으면 예약 뒤 결제창으로 넘어가고, 없으면 결제 단계 없이 접수되고, 결제는 따로 안내합니다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Minus, Plus, Search, Stamp, Trash2, X } from "lucide-react";
import { breedSize, CAT_BREEDS, DOG_BREEDS, OTHER_BREED } from "@/lib/petBreeds";
import { ARRIVAL_METHODS, DANGEROUS_DOG_NOTICE, FREE_CANCEL_NOTICE, RULE_AGREEMENT_LABEL, RULE_SANCTIONS, STAY_CONSENTS, type ArrivalMethod, type StayConsentId } from "@/lib/lodgingConsents";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { paymentsReady } from "@/lib/payments";
import { petRequirementItems } from "@/lib/petRequirements";
import { startPayment } from "@/lib/startPayment";
import WheelPicker from "@/components/lodging/WheelPicker";
import TimePicker from "@/components/TimePicker";
import { extraBasis, extraPerNight, extraUnitLabel, PET_SIZES, PET_SPECIES, petPolicySummary, roomPriceText, type LodgingProfile, type PetSize, type PetSpecies, type RoomInput } from "@/lib/lodgingRules";
import { CASH_RECEIPT_TYPES, cleanCashReceiptNumber, PET_NOTE_MAX, type CashReceiptType, type PetGender, type StayPaymentMethod, addDays, daysBetween, kstToday, nightsOf, petNightFee, petsAllowed, petsNightlyTotal, quoteStay, stayDayLabel, STAY_MAX_NIGHTS, BOOK_AHEAD_DAYS, type RoomDay, type StayPet } from "@/lib/lodgingBooking";
import { refundSchedule } from "@/lib/lodgingPolicy";
import { maxUsableStamps, STAMP_VALUE_WON, STAMPS_ENABLED, stampDiscount } from "@/lib/memoryStamps";

export type GuestRoom = RoomInput & { id: number };
type DayInfo = { day: string; price: number; closed: boolean; booked: boolean };
/** breed = 고른 견종·묘종(직접 입력이면 OTHER_BREED), breedText = 직접 입력한 이름 */
type PetForm = { species: PetSpecies; size: PetSize | ""; weight: string; kind: string; breed: string; breedText: string; age: string; ageUnit: "year" | "month"; gender: PetGender | ""; neutered: "" | "yes" | "no"; note: string };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const shortWon = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만` : n.toLocaleString("ko-KR"));
const box: React.CSSProperties = { padding: "14px 14px", borderRadius: 14, background: "#F4F3F2" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #D9D8D7", fontSize: 15, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 10 };
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 11px", borderRadius: 999, border: `1px solid ${on ? "#3B2A20" : "#DDDCDB"}`, background: on ? "#FCF1E9" : "white", color: on ? "#3B2A20" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const stepper: React.CSSProperties = { width: 32, height: 32, padding: 0, borderRadius: 999, border: "1px solid #ddd", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#333" };
const monthBtn: React.CSSProperties = { border: "1px solid #e2e4e8", background: "white", borderRadius: 8, width: 28, height: 28, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const primary = (disabled: boolean): React.CSSProperties => ({ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: disabled ? "#D4D3D2" : "#3B2A20", color: disabled ? "#4f4a3f" : "white", fontSize: 15, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });

/**
 * 견종·묘종 고르기 — 끌어서 고르는 선택창과 검색("슈나우저"처럼 일부만 쳐도 찾음). 목록에 없으면 직접 입력합니다.
 */
function BreedPicker({ kindLabel, breeds, value, text, onPick, onText }: {
  kindLabel: string; breeds: string[]; value: string; text: string; onPick: (breed: string) => void; onText: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().replace(/\s+/g, "");
  const shown = q ? breeds.filter((b) => b.replace(/\s+/g, "").includes(q) || b === value) : breeds;
  const options = [{ value: "", label: `${kindLabel}을 골라 주세요` }, ...shown.map((b) => ({ value: b, label: b })), { value: OTHER_BREED, label: "목록에 없어요 (직접 입력)" }];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1a1a1a" }}>{kindLabel} <span style={{ color: "#DC2626" }}>*</span> <span style={{ fontWeight: 500, color: "#262626" }}>위아래로 밀어서 골라 주세요</span></div>
      <div style={{ position: "relative" }}>
        <Search size={15} color="#777" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${kindLabel} 검색 (예: ${kindLabel === "견종" ? "슈나우저" : "러시안"})`} aria-label={`${kindLabel} 검색`} style={{ ...input, paddingLeft: 32 }} />
      </div>
      <WheelPicker label={kindLabel} options={options} value={value} onChange={onPick} />
      {value === OTHER_BREED && <input value={text} onChange={(e) => onText(e.target.value.slice(0, 30))} placeholder={`${kindLabel} 이름을 적어 주세요`} aria-label={`직접 입력한 ${kindLabel}`} style={input} />}
    </div>
  );
}

/** 반려동물 칸 한 줄 — 위에 항목 이름, 아래에 입력 */
function PetField({ label: text, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1f1a12" }}>{text}{required ? <span style={{ color: "#DC2626" }}> *</span> : <span style={{ fontWeight: 500, color: "#6B5E55" }}> (선택)</span>}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: "#2A1C14" }}>{hint}</div>}
    </div>
  );
}

/** 한 줄로 붙은 선택 버튼(하나만 고름) */
function Segmented({ options, value, onChange, compact }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" style={{ display: "flex", padding: 3, borderRadius: 11, background: "#F1EFED", gap: 2, flexShrink: 0 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            style={{ flex: compact ? "0 0 auto" : 1, minHeight: 38, padding: compact ? "0 12px" : "0 10px", borderRadius: 9, border: "none", background: on ? "white" : "transparent", boxShadow: on ? "0 1px 3px rgba(42,28,20,0.15)" : "none", color: on ? "#2A1C14" : "#6B5E55", fontSize: 13.5, fontWeight: on ? 800 : 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LodgingBookingSheet({ placeName, placePhone, profile, rooms, initialRoomId, onClose, variant = "sheet" }: {
  placeName: string;
  placePhone?: string | null;
  profile: LodgingProfile | null;
  rooms: GuestRoom[];
  initialRoomId: number;
  onClose: () => void;
  /** sheet = 아래에서 올라오는 창, page = 예약 화면에 그대로 */
  variant?: "sheet" | "page";
}) {
  const today = kstToday();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [roomId, setRoomId] = useState(initialRoomId);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<DayInfo[]>([]);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [guests, setGuests] = useState(Math.min(2, room?.max_guests ?? 2));
  // 숙소가 받는 동물만 고를 수 있게 합니다(동반 규정을 안 적은 숙소는 전부)
  const speciesOptions = PET_SPECIES.filter((s) => !profile || profile.pet_species.includes(s.id))
    .map((s) => ({ ...s, label: s.id === "other" && profile?.pet_others ? `그 외 (${profile.pet_others})` : s.label }));
  // 숙소가 받는 크기만 보여 줍니다(대형견을 안 받으면 대형견 버튼·대형 견종이 안 보임)
  const sizeOptions = PET_SIZES.filter((s) => !profile || profile.pet_sizes.length === 0 || profile.pet_sizes.includes(s.id));
  const dogBreeds = DOG_BREEDS.filter((b) => sizeOptions.some((s) => s.id === b.size));
  const newPet = (): PetForm => ({ species: speciesOptions[0]?.id ?? "dog", size: sizeOptions[0]?.id ?? "small", weight: "", kind: "", breed: "", breedText: "", age: "", ageUnit: "year", gender: "", neutered: "", note: "" });
  const setPet = (i: number, patch: Partial<PetForm>) => setPets((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [pets, setPets] = useState<PetForm[]>(() => [newPet()]);
  // 부가 옵션 — 고른 수(개수·인원·마리, 0이면 안 고름)
  const extraOptions = profile?.extras ?? [];
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  // 박마다 받는 옵션(바비큐 등)을 이용할 밤 — 고르지 않았으면 모든 밤
  const stayNights = checkIn && checkOut ? nightsOf(checkIn, checkOut) : [];
  const [extraDays, setExtraDays] = useState<Record<string, string[]>>({});
  const daysFor = (id: string) => { const chosen = (extraDays[id] ?? []).filter((d) => stayNights.includes(d)); return chosen.length > 0 ? chosen : stayNights; };
  // 1인당·1마리당 옵션은 예약 인원·마리 수를 넘지 않게
  const extraCap = (x: (typeof extraOptions)[number]) => (extraBasis(x) === "person" ? guests : extraBasis(x) === "pet" ? Math.max(1, pets.length) : x.max);
  const picks = extraOptions.filter((x) => (extraQty[x.id] ?? 0) > 0).map((x) => ({ id: x.id, qty: Math.min(extraQty[x.id], extraCap(x)), ...(extraPerNight(x) ? { days: daysFor(x.id) } : {}) }));
  const [form, setForm] = useState({ paymentMethod: "card" as StayPaymentMethod, cashType: "none" as CashReceiptType, cashNumber: "", name: "", phone: "", email: "", memo: "", sameGuest: true, stayGuestName: "", stayGuestPhone: "", arrivalMethod: "" as ArrivalMethod | "", arrivalTime: "" });
  const [consents, setConsents] = useState<StayConsentId[]>([]);
  const [openConsent, setOpenConsent] = useState<StayConsentId | null>(null);
  const allAgreed = consents.length === STAY_CONSENTS.length;
  // 숙소가 정한 입실 조건 — 모두 읽고 맨 아래에서 한 번 동의합니다
  const petItems = petRequirementItems(profile?.pet_requirements);
  const [ruleAgreed, setRuleAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string } | null>(null);
  // 추억 스탬프 — 가진 개수와 쓰려는 개수
  const [stampsOwned, setStampsOwned] = useState(0);
  const [stampsWanted, setStampsWanted] = useState(0);
  useEffect(() => {
    if (!STAMPS_ENABLED) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/me/stamps", { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const json = res && res.ok ? await res.json().catch(() => null) : null;
      if (!cancelled && json?.ready) setStampsOwned(Number(json.available) || 0);
    })();
    return () => { cancelled = true; };
  }, []);

  // 이번 달과 다음 달 달력(체크아웃이 다음 달로 넘어갈 수 있어서)
  const first = `${month}-01`;
  const next = addDays(first, 32).slice(0, 7) + "-01";
  const after = addDays(next, 32).slice(0, 7) + "-01";
  const load = useCallback(async () => {
    if (!room) return;
    try {
      const res = await fetch(`/api/lodging/availability?roomId=${room.id}&from=${first}&to=${after}`);
      const json = await res.json();
      // 달을 넘겨도 앞에서 받은 날짜는 남겨 둡니다(10/31 체크인 → 11/2 체크아웃처럼 두 달에 걸친 숙박)
      setDays((prev) => {
        const merged = new Map(prev.map((d) => [d.day, d]));
        for (const d of (json.days ?? []) as DayInfo[]) merged.set(d.day, d);
        return [...merged.values()];
      });
    } catch { /* 못 받으면 고를 수 있는 날이 없게 보입니다 */ }
  }, [room, first, after]);
  // 객실을 바꾸면 그 객실 달력을 처음부터 받습니다
  useEffect(() => { setDays([]); }, [roomId]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const lastDay = addDays(today, BOOK_AHEAD_DAYS);
  const free = (day: string) => { const d = byDay.get(day); return !!d && !d.closed && !d.booked && day >= today && day <= lastDay; };

  const pick = (day: string) => {
    setError(null);
    if (!checkIn || checkOut || day <= checkIn) {
      if (!free(day)) return;
      setCheckIn(day); setCheckOut(null);
      return;
    }
    const nights = nightsOf(checkIn, day);
    if (nights.length > STAY_MAX_NIGHTS) { setError(`한 번에 ${STAY_MAX_NIGHTS}박까지 예약할 수 있어요.`); return; }
    if (!nights.every(free)) { setError("중간에 예약할 수 없는 날이 있어요. 날짜를 다시 골라 주세요."); setCheckIn(free(day) ? day : null); return; }
    setCheckOut(day);
  };

  const breedOf = (p: PetForm) => (p.breed === OTHER_BREED ? p.breedText.trim() : p.breed) || null;
  const stayPets: StayPet[] = pets.map((p) => ({ species: p.species, size: p.species === "dog" && p.size ? p.size : null, weight: p.weight ? Number(p.weight) : null, kind: p.species === "other" ? p.kind.trim() || null : null, breed: p.species === "other" ? null : breedOf(p), age_months: p.age ? Number(p.age) * (p.ageUnit === "year" ? 12 : 1) : null, gender: p.gender || null, neutered: p.neutered === "" ? null : p.neutered === "yes", note: p.note.trim() || null }));
  const petNightly = petsNightlyTotal(profile, stayPets);
  const petProblem = room ? petsAllowed(profile, room, stayPets) : null;
  const roomDays: RoomDay[] = days.map((d) => ({ day: d.day, closed: d.closed, price: d.price }));
  const quote = room && checkIn && checkOut ? quoteStay(room, petNightly, roomDays, checkIn, checkOut, guests, picks, extraOptions, pets.length) : null;
  const priced = quote && !("error" in quote) ? quote : null;
  // 스탬프를 뺀 실제 결제 금액
  const stampUse = priced ? stampDiscount(priced.total, stampsWanted, stampsOwned) : { used: 0, discount: 0 };
  const payTotal = priced ? priced.total - stampUse.discount : 0;
  const stampMax = priced ? maxUsableStamps(priced.total, stampsOwned) : 0;
  const schedule = priced && checkIn ? refundSchedule(payTotal, checkIn, today, profile?.peak_periods) : [];
  const step1Ready = !!priced && !petProblem && pets.every((p) => (p.species !== "dog" || p.size) && (p.species !== "other" ? !!breedOf(p) : !!p.kind.trim()) && (!profile?.pet_requirements?.min_age_months || !!p.age) && (!profile?.pet_requirements?.neutered || p.neutered !== ""));
  const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 9;
  const step2Ready = !!form.name.trim() && phoneOk(form.phone) && !!form.arrivalMethod && allAgreed && ruleAgreed && (form.paymentMethod !== "transfer" || form.cashType === "none" || !!cleanCashReceiptNumber(form.cashType, form.cashNumber)) && !busy
    && (form.sameGuest || (!!form.stayGuestName.trim() && phoneOk(form.stayGuestPhone)));
  const maxPets = room?.max_pets ?? profile?.max_pets ?? 10;

  const submit = async () => {
    if (!step2Ready || !checkIn || !checkOut || !room) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인한 뒤 예약할 수 있어요.");
      const res = await fetch("/api/lodging/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ roomId: room.id, checkIn, checkOut, guests, pets: stayPets, extras: picks, ...form, consents, petAcks: ruleAgreed ? petItems.map((i) => i.id) : [], ruleAgreed, stamps: stampUse.used }),
      });
      const json = await res.json().catch(() => ({}));
      // 그 사이 다른 손님이 먼저 예약했으면 달력을 새로 받아 날짜 고르기로 돌아갑니다
      if (res.status === 409 && /먼저 예약/.test(json.error ?? "")) { await load(); setCheckIn(null); setCheckOut(null); setStep(1); }
      if (!res.ok) throw new Error(json.error || "예약하지 못했어요.");
      // 선결제: 결제창으로 넘어갑니다. 끝나면 /pay/success로 돌아옵니다
      if (json.needsPayment) { await startPayment("lodging", Number(json.booking.id), form.paymentMethod); return; }
      setResult({ status: json.booking?.status ?? "requested" });
      setStep(3);
    } catch (e) { setError(e instanceof Error ? e.message : "예약하지 못했어요."); }
    finally { setBusy(false); }
  };

  const monthStart = today.slice(0, 7);
  const lastMonth = lastDay.slice(0, 7);
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const count = daysBetween(first, next);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];

  const isPage = variant === "page";
  const body = (
      <div onClick={(e) => e.stopPropagation()} className={isPage ? "ggk-book-page ggk-readable" : "ggk-readable"} style={isPage
        ? { width: "100%", boxSizing: "border-box", wordBreak: "keep-all" }
        : { width: "100%", maxWidth: 520, maxHeight: "92dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "18px 18px 24px", boxSizing: "border-box", wordBreak: "keep-all" }}>
        {isPage && (
          <>
            <style>{`
              .ggk-book-page { color: #1f1a12; }
              .ggk-book-cols { display: grid; gap: 18px; padding: 24px 18px 24px; }
              .ggk-book-main { display: grid; gap: 18px; min-width: 0; }
              .ggk-book-aside { display: grid; gap: 12px; min-width: 0; }
              .ggk-book-main > :not(button):not([role="status"]), .ggk-book-aside > div:first-child:not([role="status"]) { background: white !important; border: 1px solid #E6E5E4 !important; border-radius: 18px !important; padding: 18px !important; box-sizing: border-box; }
              @media (min-width: 900px) {
                .ggk-book-cols { grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; align-items: start; padding: 32px 32px 32px; }
                .ggk-book-aside { position: sticky; top: 16px; }
              }
            `}</style>
            <section style={{ background: "linear-gradient(160deg,#8A5A3E 0%,#A0704F 100%)", color: "white", borderRadius: "0 0 26px 26px", padding: "22px 24px 26px" }}>
              <button onClick={step === 2 ? () => setStep(1) : onClose} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 0, border: "none", background: "transparent", color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <ChevronLeft size={16} />{step === 2 ? "날짜·인원 다시 고르기" : placeName}
              </button>
              <h1 className="ggk-logo" style={{ margin: "14px 0 0", fontSize: "clamp(26px, 4.4vw, 36px)", fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.6px" }}>
                {step === 1 ? <>함께 머물 날을<br /><span style={{ color: "#F6D7BE" }}>골라 주세요.</span></> : step === 2 ? <>예약 내용을<br /><span style={{ color: "#F6D7BE" }}>확인해 주세요.</span></> : <>예약이<br /><span style={{ color: "#F6D7BE" }}>접수되었어요.</span></>}
              </h1>
              <ol aria-label="예약 단계" style={{ display: "flex", gap: 6, margin: "18px 0 0", padding: 0, listStyle: "none", flexWrap: "wrap" }}>
                {["날짜·인원", "확인·결제", "완료"].map((text, i) => (
                  <li key={text} aria-current={step === i + 1 ? "step" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 6px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: step === i + 1 ? "#F6D7BE" : "rgba(255,255,255,0.12)", color: step === i + 1 ? "#3B2A20" : "rgba(255,255,255,0.88)" }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: step === i + 1 ? "#3B2A20" : "rgba(255,255,255,0.2)", color: step === i + 1 ? "#F6D7BE" : "white" }}>{i + 1}</span>{text}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
        {!isPage && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {step === 2 && <button onClick={() => setStep(1)} aria-label="이전 단계" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#262626" }}>{placeName}</div>
            <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>{step === 1 ? "날짜·인원·반려동물" : step === 2 ? "예약 확인" : "예약 완료"}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>}

        {step === 1 && room && (
          <div className={isPage ? "ggk-book-cols" : undefined} style={isPage ? undefined : { display: "grid", gap: 14 }}>
          <div className={isPage ? "ggk-book-main" : undefined} style={isPage ? undefined : { display: "contents" }}>
            {rooms.length > 1 && (
              <div>
                <div style={label}>객실</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {rooms.map((r) => <button key={r.id} onClick={() => { setRoomId(r.id); setCheckIn(null); setCheckOut(null); }} aria-pressed={r.id === room.id} style={chip(r.id === room.id)}>{r.name}</button>)}
                </div>
                <div style={{ fontSize: 12, color: "#262626", marginTop: 5 }}>{roomPriceText(room)} · 기준 {room.std_guests}명 · 최대 {room.max_guests}명</div>
              </div>
            )}

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={label}>{!checkIn ? "체크인 날짜를 골라 주세요" : !checkOut ? "체크아웃 날짜를 골라 주세요" : `${stayDayLabel(checkIn)} ~ ${stayDayLabel(checkOut)} · ${daysBetween(checkIn, checkOut)}박`}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setMonth(addDays(first, -1).slice(0, 7))} disabled={month <= monthStart} aria-label="이전 달" style={{ ...monthBtn, opacity: month <= monthStart ? 0.35 : 1 }}><ChevronLeft size={13} /></button>
                  <button onClick={() => setMonth(next.slice(0, 7))} disabled={month >= lastMonth} aria-label="다음 달" style={{ ...monthBtn, opacity: month >= lastMonth ? 0.35 : 1 }}><ChevronRight size={13} /></button>
                </div>
              </div>
              {/* 달력은 넓은 화면에서도 읽기 좋은 폭(최대 440px)으로 가운데에 둡니다 — 칸이 너무 넓게 퍼지면 날짜를 찾기 어려웠습니다 */}
              <div style={{ maxWidth: 440, margin: "0 auto" }}>
              <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#111", margin: "6px 0 10px" }}>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
                {WEEK.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 13.5, fontWeight: 800, color: i === 0 ? "#DC2626" : i === 6 ? "#1D4F91" : "#111", paddingBottom: 2 }}>{w}</div>)}
                {cells.map((day, i) => {
                  if (!day) return <div key={`b${i}`} />;
                  const d = byDay.get(day);
                  const ok = free(day);
                  const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
                  const edge = day === checkIn || day === checkOut;
                  // 체크아웃 날은 그날 밤이 찼어도 고를 수 있습니다
                  const selectable = ok || (!!checkIn && !checkOut && day > checkIn);
                  return (
                    <button key={day} onClick={() => selectable && pick(day)} disabled={!selectable} aria-pressed={edge}
                      style={{ minHeight: 54, padding: "5px 2px", borderRadius: 10, border: edge ? "2px solid #3B2A20" : "1px solid #E7E6E5", background: edge ? "#3B2A20" : inRange ? "#FBEDE3" : "white", color: edge ? "white" : ok ? "#111" : "#9A938E", cursor: selectable ? "pointer" : "default", fontFamily: "inherit", textDecoration: !ok && day >= today && !edge ? "line-through" : "none" }}>
                      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{Number(day.slice(8))}</div>
                      {ok && d && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: edge ? "white" : "#A05A32" }}>{shortWon(d.price)}</div>}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={label}>인원 <span style={{ fontWeight: 600, color: "#333" }}>기준 {room.std_guests}명 · 최대 {room.max_guests}명{(room.extra_guest_fee ?? 0) > 0 ? ` · 초과 1명당 1박 ${won(room.extra_guest_fee ?? 0)}` : ""}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setGuests((g) => Math.max(1, g - 1))} disabled={guests <= 1} aria-label="인원 줄이기" style={{ ...stepper, opacity: guests <= 1 ? 0.4 : 1 }}><Minus size={14} /></button>
                <b style={{ minWidth: 20, textAlign: "center" }}>{guests}</b>
                <button onClick={() => setGuests((g) => Math.min(room.max_guests, g + 1))} disabled={guests >= room.max_guests} aria-label="인원 늘리기" style={{ ...stepper, opacity: guests >= room.max_guests ? 0.4 : 1 }}><Plus size={14} /></button>
              </div>
            </div>

            <div>
              <div style={label}>함께 가는 반려동물 <span style={{ fontWeight: 600, color: "#333" }}>정확히 적어야 입실 거부를 막을 수 있어요</span></div>
              {profile && <div style={{ fontSize: 12, color: "#3B2A20", marginBottom: 7 }}>이 숙소는 {petPolicySummary(profile)}</div>}
              <div role="note" style={{ marginBottom: 8, padding: "9px 11px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FBD5D5", fontSize: 12, color: "#991B1B", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 6 }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ whiteSpace: "pre-line" }}>{DANGEROUS_DOG_NOTICE}</span></div>
                {placePhone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid #FBD5D5" }}>
                    <span style={{ flex: 1, minWidth: 0, color: "#333", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{placeName} · {placePhone}</span>
                    <a href={`tel:${placePhone}`} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 999, background: "#991B1B", color: "white", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>전화하기</a>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {pets.map((p, i) => {
                  const breeds = p.species === "dog" ? dogBreeds.map((b) => b.name) : p.species === "cat" ? CAT_BREEDS : [];
                  const fee = petNightFee(profile, { species: p.species, size: p.species === "dog" && p.size ? p.size : null });
                  return (
                  <div key={i} style={{ padding: "14px 14px 12px", borderRadius: 14, border: "1px solid #E7E6E5", background: "white", display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14.5, color: "#1f1a12" }}>{i + 1}번째 반려동물</b>
                      {profile && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#A05A32" }}>{fee > 0 ? `1박 ${won(fee)}${(profile.pet_free_count ?? 0) > 0 ? ` · ${profile.pet_free_count}마리까지 무료` : ""}` : "추가 요금 없음"}</span>}
                      {pets.length > 1 && <button onClick={() => setPets((all) => all.filter((_, j) => j !== i))} aria-label={`${i + 1}번째 반려동물 빼기`} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", cursor: "pointer", color: "#b42318", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}><Trash2 size={14} />빼기</button>}
                    </div>
                    {speciesOptions.length > 1 && (
                      <PetField label="종류" required>
                        <Segmented options={speciesOptions.map((o) => ({ id: o.id, label: o.label }))} value={p.species} onChange={(id) => setPet(i, { species: id as PetSpecies, breed: "", breedText: "" })} />
                      </PetField>
                    )}
                    {p.species !== "other" ? (
                      <BreedPicker
                        kindLabel={p.species === "dog" ? "견종" : "묘종"} breeds={breeds} value={p.breed} text={p.breedText}
                        onPick={(breed) => { const size = breedSize(breed); setPet(i, { breed, ...(size && sizeOptions.some((o) => o.id === size) ? { size } : {}) }); }}
                        onText={(breedText) => setPet(i, { breedText })}
                      />
                    ) : (
                      <PetField label="어떤 동물인가요" required>
                        <input value={p.kind} onChange={(e) => setPet(i, { kind: e.target.value.slice(0, 20) })} placeholder="예: 토끼" aria-label="동물 종류" style={input} />
                      </PetField>
                    )}
                    {p.species === "dog" && (
                      <PetField label="크기" required hint={sizeOptions.length < PET_SIZES.length ? `이 숙소는 ${PET_SIZES.filter((o) => !sizeOptions.includes(o)).map((o) => o.label).join("·")}을 받지 않아요` : undefined}>
                        <Segmented options={sizeOptions.map((o) => ({ id: o.id, label: o.label }))} value={p.size} onChange={(id) => setPet(i, { size: id as PetSize })} />
                      </PetField>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                      <PetField label="몸무게" hint={profile?.max_pet_weight_kg != null ? `${profile.max_pet_weight_kg}kg 이하만 입실할 수 있어요` : undefined}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input value={p.weight} onChange={(e) => setPet(i, { weight: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} placeholder="예: 6.5" inputMode="decimal" aria-label="몸무게" style={{ ...input, flex: 1, minWidth: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#1f1a12" }}>kg</span>
                        </div>
                      </PetField>
                      <PetField label="나이" required={!!profile?.pet_requirements?.min_age_months}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input value={p.age} onChange={(e) => setPet(i, { age: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="예: 3" aria-label={`${i + 1}번째 반려동물 나이`} style={{ ...input, flex: 1, minWidth: 0 }} />
                          <Segmented options={[{ id: "year", label: "살" }, { id: "month", label: "개월" }]} value={p.ageUnit} onChange={(id) => setPet(i, { ageUnit: id as "year" | "month" })} compact />
                        </div>
                      </PetField>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                      <PetField label="성별">
                        <Segmented options={[{ id: "male", label: "수컷" }, { id: "female", label: "암컷" }]} value={p.gender} onChange={(id) => setPet(i, { gender: p.gender === id ? "" : (id as PetGender) })} />
                      </PetField>
                      <PetField label="중성화" required={!!profile?.pet_requirements?.neutered}>
                        <Segmented options={[{ id: "yes", label: "했어요" }, { id: "no", label: "안 했어요" }]} value={p.neutered} onChange={(id) => setPet(i, { neutered: p.neutered === id ? "" : (id as "yes" | "no") })} />
                      </PetField>
                    </div>
                    <PetField label="특이사항" hint="분리불안, 짖음, 입질, 낯가림, 복용 중인 약, 알레르기 등">
                      <textarea value={p.note} onChange={(e) => setPet(i, { note: e.target.value.slice(0, PET_NOTE_MAX) })} rows={2} placeholder="숙소가 미리 알아야 할 점이 있으면 적어 주세요" aria-label={`${i + 1}번째 반려동물 특이사항`} style={{ ...input, resize: "vertical" }} />
                    </PetField>
                  </div>
                  );
                })}
              </div>
              {pets.length < maxPets && <button onClick={() => setPets((all) => [...all, newPet()])} style={{ marginTop: 10, border: "1px dashed #C9A48A", background: "white", color: "#3B2A20", borderRadius: 12, padding: "12px 0", width: "100%", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus size={15} />반려동물 한 마리 더 추가</button>}
              {petProblem && <div role="status" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{petProblem}</div>}
            </div>

            {extraOptions.length > 0 && (
              <div>
                <div style={label}>추가 옵션 <span style={{ fontWeight: 600, color: "#2A1C14" }}>이용할 것만 체크하면 숙박 요금과 함께 결제돼요</span></div>
                <div style={{ display: "grid", gap: 8 }}>
                  {extraOptions.map((x) => {
                    const cap = extraCap(x);
                    const qty = Math.min(extraQty[x.id] ?? 0, cap);
                    const used = qty > 0;
                    const basis = extraBasis(x);
                    const perNight = extraPerNight(x);
                    const chosen = daysFor(x.id);
                    const nightsUsed = perNight ? Math.max(1, chosen.length) : 1;
                    const countWord = basis === "person" ? "명" : basis === "pet" ? "마리" : "개";
                    // 처음 고르면 1인당은 예약 인원, 1마리당은 함께 가는 마리 수, 1회는 1개
                    const firstQty = basis === "person" ? guests : basis === "pet" ? pets.length : 1;
                    return (
                      <div key={x.id} style={{ padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${used ? "#A05A32" : "#E7E6E5"}`, background: used ? "#FFF8F3" : "white", display: "grid", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                          <input type="checkbox" checked={used} onChange={(e) => setExtraQty((q) => ({ ...q, [x.id]: e.target.checked ? Math.max(1, Math.min(firstQty, cap)) : 0 }))} style={{ width: 19, height: 19, marginTop: 2, flexShrink: 0, accentColor: "#A05A32" }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#1f1a12" }}>{x.name}</span>
                            <span style={{ display: "block", fontSize: 13, color: "#3B2A20", marginTop: 2 }}><b>{won(x.price)}</b> · {extraUnitLabel(x)}</span>
                            {x.note && <span style={{ display: "block", fontSize: 12.5, color: "#2A1C14", marginTop: 2 }}>{x.note}</span>}
                          </span>
                        </label>
                        {used && (basis !== "stay" || x.max > 1) && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#1f1a12", paddingLeft: 29 }}>
                            <span style={{ flex: 1, fontWeight: 700 }}>{basis === "person" ? "이용 인원" : basis === "pet" ? "이용 마리 수" : "수량"} <span style={{ fontWeight: 500, color: "#2A1C14", fontSize: 12.5 }}>최대 {cap}{countWord}</span></span>
                            <button type="button" onClick={() => setExtraQty((q) => ({ ...q, [x.id]: Math.max(1, qty - 1) }))} disabled={qty <= 1} aria-label={`${x.name} 줄이기`} style={{ ...stepper, opacity: qty <= 1 ? 0.4 : 1 }}><Minus size={14} /></button>
                            <b style={{ minWidth: 34, textAlign: "center" }}>{qty}{countWord}</b>
                            <button type="button" onClick={() => setExtraQty((q) => ({ ...q, [x.id]: Math.min(cap, qty + 1) }))} disabled={qty >= cap} aria-label={`${x.name} 늘리기`} style={{ ...stepper, opacity: qty >= cap ? 0.4 : 1 }}><Plus size={14} /></button>
                          </div>
                        )}
                        {used && perNight && stayNights.length > 1 && (
                          <div style={{ paddingLeft: 29 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1f1a12", marginBottom: 6 }}>이용할 밤 <span style={{ fontWeight: 500, color: "#2A1C14", fontSize: 12.5 }}>{chosen.length}박 선택</span></div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {stayNights.map((d) => {
                                const on = chosen.includes(d);
                                return <button key={d} type="button" onClick={() => setExtraDays((all) => { const next = on ? chosen.filter((c) => c !== d) : [...chosen, d].sort(); return next.length > 0 ? { ...all, [x.id]: next } : all; })} aria-pressed={on} style={chip(on)}>{stayDayLabel(d)} 밤</button>;
                              })}
                            </div>
                          </div>
                        )}
                        {used && (
                          <div style={{ paddingLeft: 29, fontSize: 13, fontWeight: 800, color: "#A05A32" }}>
                            {won(x.price)}{basis !== "stay" || qty > 1 ? ` × ${qty}${countWord}` : ""}{perNight ? ` × ${nightsUsed}박` : ""} = {won(x.price * qty * nightsUsed)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
          <div className={isPage ? "ggk-book-aside" : undefined} style={isPage ? undefined : { display: "contents" }}>
            {/* 지금 금액 — 추가 요금까지 모두 여기서 결제하고, 현장에서는 내지 않습니다 */}
            {priced && (
              <div style={{ padding: "12px 13px", borderRadius: 12, background: "#FBF3ED", display: "grid", gap: 4, fontSize: 13, color: "#1a1a1a" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>객실 {priced.nights.length}박</span><span>{won(priced.roomTotal)}</span></div>
                {priced.extraGuestTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>인원 추가</span><span>{won(priced.extraGuestTotal)}</span></div>}
                {priced.petTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>반려동물 추가</span><span>{won(priced.petTotal)}</span></div>}
                {priced.extrasTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>추가 옵션</span><span>{won(priced.extrasTotal)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E3E2E1", paddingTop: 6, marginTop: 2, fontSize: 15, fontWeight: 800, color: "#3B2A20" }}><span>총 금액</span><span>{won(priced.total)}</span></div>
                <div style={{ fontSize: 11.5, color: "#262626" }}>추가 요금까지 모두 포함된 금액이에요. 현장에서 따로 내는 돈은 없어요.</div>
              </div>
            )}
            {quote && "error" in quote && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{quote.error}</div>}
            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <button onClick={() => setStep(2)} disabled={!step1Ready} style={primary(!step1Ready)}>{priced ? `${won(priced.total)} · 다음` : "날짜를 골라 주세요"}</button>
          </div>
          </div>
        )}

        {step === 2 && room && priced && checkIn && checkOut && (
          <div className={isPage ? "ggk-book-main" : undefined} style={isPage ? { maxWidth: 760, margin: "0 auto", padding: "32px 18px 32px" } : { display: "grid", gap: 14 }}>
            <div style={box}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{room.name}</div>
              <div style={{ fontSize: 12.5, color: "#1a1a1a", marginTop: 4, lineHeight: 1.7 }}>
                {stayDayLabel(checkIn)} {profile?.check_in ? `${profile.check_in} 체크인` : ""} ~ {stayDayLabel(checkOut)} {profile?.check_out ? `${profile.check_out} 체크아웃` : ""}<br />
                {priced.nights.length}박 · {guests}명 · 반려동물 {pets.length}마리
              </div>
            </div>

            <div>
              <div style={label}>요금</div>
              <div style={{ display: "grid", gap: 4, fontSize: 13, color: "#1a1a1a" }}>
                {priced.nights.map((n) => <div key={n.day} style={{ display: "flex", justifyContent: "space-between" }}><span>{stayDayLabel(n.day)} 1박</span><span>{won(n.price)}</span></div>)}
                {priced.extraGuestTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>인원 추가</span><span>{won(priced.extraGuestTotal)}</span></div>}
                {priced.petTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>반려동물 추가({pets.length}마리 × {priced.nights.length}박)</span><span>{won(priced.petTotal)}</span></div>}
                {priced.extras.map((x) => <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{x.name} · {won(x.price)} × {x.qty}{extraBasis(x) === "person" ? "명" : extraBasis(x) === "pet" ? "마리" : "개"}{x.days ? ` × ${x.days.length}박` : ""}</span><span>{won(x.amount)}</span></div>)}
                {stampUse.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#6B5525", fontWeight: 700 }}><span>추억 스탬프 {stampUse.used}개</span><span>-{won(stampUse.discount)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4, fontSize: 16, fontWeight: 800, color: "#3B2A20" }}><span>총 결제 금액</span><span>{won(payTotal)}</span></div>
                <div style={{ fontSize: 11.5, color: "#262626" }}>추가 요금까지 모두 포함했어요. 현장에서 따로 내는 금액은 없어요. 현장에서 더 요구받으면 &lsquo;문제 있어요&rsquo;로 알려 주세요.</div>
              </div>
            </div>

            {stampMax > 0 && (
              <div style={{ padding: "12px 13px", borderRadius: 12, background: "#FFFBEF", border: "1px solid #EFE2B8" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Stamp size={18} color="#8A6D1F" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#5C4A22" }}>추억 스탬프 쓰기</div>
                    <div style={{ fontSize: 12, color: "#655a3c" }}>{stampsOwned}개 보유 · 1개당 {won(STAMP_VALUE_WON)} · 이번 예약은 {stampMax}개까지</div>
                  </div>
                  <button type="button" onClick={() => setStampsWanted(Math.max(0, stampUse.used - 1))} disabled={stampUse.used <= 0} aria-label="스탬프 줄이기" style={{ ...stepper, opacity: stampUse.used <= 0 ? 0.4 : 1 }}><Minus size={14} /></button>
                  <b style={{ minWidth: 22, textAlign: "center" }}>{stampUse.used}</b>
                  <button type="button" onClick={() => setStampsWanted(Math.min(stampMax, stampUse.used + 1))} disabled={stampUse.used >= stampMax} aria-label="스탬프 늘리기" style={{ ...stepper, opacity: stampUse.used >= stampMax ? 0.4 : 1 }}><Plus size={14} /></button>
                </div>
                <button type="button" onClick={() => setStampsWanted(stampMax)} style={{ marginTop: 6, border: "none", background: "transparent", padding: 0, color: "#8A6D1F", fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>최대로 쓰기</button>
                <div style={{ fontSize: 11.5, color: "#6b5f3e", marginTop: 3 }}>예약이 취소되면 쓴 스탬프는 돌아와요.</div>
              </div>
            )}

            <div>
              <div style={label}>취소하면 돌려받는 금액</div>
              <div style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#1a1a1a" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>오늘({stayDayLabel(today)}) 안에 취소</span><b style={{ color: "#15803D" }}>{won(payTotal)} 전액</b></div>
                {schedule.filter((r) => r.until > today).map((r) => (
                  <div key={r.until} style={{ display: "flex", justifyContent: "space-between" }}><span>{stayDayLabel(r.until)}까지 취소</span><span style={{ fontWeight: 700, color: r.rate === 0 ? "#15803D" : "#B45309" }}>{r.rate === 0 ? `${won(r.refund)} 전액` : `${won(r.refund)} (${r.rate}% 공제)`}</span></div>
                ))}
                <div style={{ fontSize: 11.5, color: "#262626", marginTop: 2 }}>공정거래위원회 소비자분쟁해결기준(숙박업)에 따릅니다. 체크인 날이 지나면 취소할 수 없어요.</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={label}>예약자 정보 <span style={{ color: "#DC2626" }}>*</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 20) }))} placeholder="이름 (필수)" aria-label="예약자 이름" autoComplete="name" style={input} />
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.slice(0, 13) }))} placeholder="휴대전화 (필수)" aria-label="예약자 휴대전화" inputMode="tel" autoComplete="tel" style={input} />
              </div>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.slice(0, 120) }))} placeholder="이메일 (선택) — 예약 내역을 받아 볼 주소" aria-label="예약자 이메일" inputMode="email" autoComplete="email" style={input} />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ ...label, marginBottom: 0 }}>이용자 정보 <span style={{ color: "#DC2626" }}>*</span></div>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#1a1a1a", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.sameGuest} onChange={(e) => setForm((f) => ({ ...f, sameGuest: e.target.checked }))} style={{ width: 15, height: 15 }} />예약자와 같아요
                </label>
              </div>
              {!form.sameGuest && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input value={form.stayGuestName} onChange={(e) => setForm((f) => ({ ...f, stayGuestName: e.target.value.slice(0, 20) }))} placeholder="실제 이용자 이름" aria-label="실제 이용자 이름" style={input} />
                  <input value={form.stayGuestPhone} onChange={(e) => setForm((f) => ({ ...f, stayGuestPhone: e.target.value.slice(0, 13) }))} placeholder="실제 이용자 휴대전화" aria-label="실제 이용자 휴대전화" inputMode="tel" style={input} />
                </div>
              )}
              <div style={{ fontSize: 11.5, color: "#262626" }}>숙소가 입실 안내·확인 연락을 드릴 분이에요.</div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={label}>방문 정보</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "#1a1a1a", width: 70 }}>방문 수단 <span style={{ color: "#DC2626" }}>*</span></span>
                {ARRIVAL_METHODS.map((m) => <button key={m.id} type="button" onClick={() => setForm((f) => ({ ...f, arrivalMethod: m.id }))} aria-pressed={form.arrivalMethod === m.id} style={chip(form.arrivalMethod === m.id)}>{m.label}</button>)}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "#1a1a1a", width: 70 }}>도착 예정</span>
                <TimePicker ariaLabel="도착 예정 시각(선택)" value={form.arrivalTime} onChange={(t) => setForm((f) => ({ ...f, arrivalTime: t }))} min={profile?.check_in ?? "12:00"} emptyLabel="아직 몰라요" />
                <span style={{ fontSize: 11.5, color: "#333" }}>선택 · 목록에 없는 시간은 맨 아래 &lsquo;직접 입력&rsquo;</span>
              </div>
              <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value.slice(0, 300) }))} rows={2} placeholder="숙소에 전할 말(선택) — 예: 늦게 도착해요, 노견이라 1층 객실 부탁드려요" aria-label="요청 사항" style={{ ...input, resize: "vertical" }} />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={label}>결제 수단</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([["card", "카드·간편결제"], ["transfer", "계좌이체"]] as const).map(([id, text]) => <button key={id} type="button" onClick={() => setForm((f) => ({ ...f, paymentMethod: id }))} aria-pressed={form.paymentMethod === id} style={chip(form.paymentMethod === id)}>{text}</button>)}
              </div>
              {form.paymentMethod === "transfer" && (
                <div style={{ padding: "10px 12px", borderRadius: 12, background: "#F8F8F4", display: "grid", gap: 7 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1a1a1a" }}>현금영수증</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {CASH_RECEIPT_TYPES.map((t) => <button key={t.id} type="button" onClick={() => setForm((f) => ({ ...f, cashType: t.id, cashNumber: "" }))} aria-pressed={form.cashType === t.id} style={chip(form.cashType === t.id)}>{t.label}</button>)}
                  </div>
                  {form.cashType !== "none" && <input value={form.cashNumber} onChange={(e) => setForm((f) => ({ ...f, cashNumber: e.target.value.slice(0, 13) }))} inputMode="numeric" placeholder={CASH_RECEIPT_TYPES.find((t) => t.id === form.cashType)?.hint} aria-label="현금영수증 번호" style={input} />}
                  <div style={{ fontSize: 11.5, color: "#262626", lineHeight: 1.6 }}>신청한 내용은 숙소에 전달되고, 숙소에서 발급해요.</div>
                </div>
              )}
            </div>

            <div data-guide="stay-rule-agreement" style={{ borderRadius: 14, border: "1.5px solid #E2C3AE", overflow: "hidden", background: "white" }}>
              <div style={{ padding: "14px 16px", background: "#FBEDE3" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>숙소 규정을 꼭 읽어 주세요</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 3 }}>맞지 않으면 현장에서 입실이 거부될 수 있어요.</div>
              </div>
              {petItems.length > 0 && (
                <ul style={{ margin: 0, padding: "12px 16px 12px 34px", listStyle: "disc", display: "grid", gap: 8, fontSize: 15, color: "#111", lineHeight: 1.6, borderTop: "1px solid #F1D8C7" }}>
                  {petItems.map((i) => <li key={i.id} style={{ fontWeight: 600 }}>{i.text}</li>)}
                </ul>
              )}
              {(profile?.pet_rules || profile?.stay_rules) && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #F1D8C7", display: "grid", gap: 10, fontSize: 15, color: "#111", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  {profile?.pet_rules && <div><b style={{ fontSize: 15.5 }}>반려동물 동반 수칙</b><br />{profile.pet_rules}</div>}
                  {profile?.stay_rules && <div><b style={{ fontSize: 15.5 }}>숙소 이용 수칙</b><br />{profile.stay_rules}</div>}
                </div>
              )}
              <div style={{ padding: "12px 16px", borderTop: "1px solid #F1D8C7", background: "#FFF6F2", display: "grid", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#9A3B27" }}>규정을 어기면</div>
                {RULE_SANCTIONS.map((x) => <div key={x.title} style={{ fontSize: 14, color: "#111", lineHeight: 1.65 }}><b>{x.title}</b> · {x.text}</div>)}
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 16px", borderTop: "1.5px solid #E2C3AE", background: ruleAgreed ? "#FFF8F3" : "white", fontSize: 15, fontWeight: 800, color: "#111", lineHeight: 1.55, cursor: "pointer" }}>
                <input type="checkbox" checked={ruleAgreed} onChange={(e) => setRuleAgreed(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: "#A05A32" }} />
                <span>[필수] {RULE_AGREEMENT_LABEL}</span>
              </label>
            </div>

            <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 12px", background: "#f8fafc", fontSize: 14, fontWeight: 800, color: "#111", cursor: "pointer" }}>
                <input type="checkbox" checked={allAgreed} onChange={(e) => setConsents(e.target.checked ? STAY_CONSENTS.map((c) => c.id) : [])} style={{ width: 17, height: 17 }} />
                필수 약관 전체 동의
              </label>
              {STAY_CONSENTS.map((c) => (
                <div key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                    <input type="checkbox" id={`consent-${c.id}`} checked={consents.includes(c.id)} onChange={(e) => setConsents((all) => (e.target.checked ? [...all, c.id] : all.filter((x) => x !== c.id)))} style={{ width: 15, height: 15 }} />
                    <label htmlFor={`consent-${c.id}`} style={{ flex: 1, fontSize: 12.5, color: "#1a1a1a", cursor: "pointer" }}><b style={{ color: "#DC2626" }}>[필수]</b> {c.label}</label>
                    <button type="button" onClick={() => setOpenConsent(openConsent === c.id ? null : c.id)} aria-expanded={openConsent === c.id} style={{ border: "none", background: "transparent", color: "#262626", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{openConsent === c.id ? "접기" : "보기"}</button>
                  </div>
                  {openConsent === c.id && (
                    <ul style={{ margin: 0, padding: "0 14px 10px 34px", fontSize: 11.5, color: "#262626", lineHeight: 1.7 }}>
                      {c.detail.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "#262626", lineHeight: 1.6, padding: "10px 12px", borderRadius: 10, background: "#f8fafc" }}>
              {paymentsReady() ? "결제를 마쳐야 예약이 접수돼요. 20분 안에 결제하지 않으면 날짜가 풀려요." : "카드 결제는 준비 중이에요. 지금은 예약이 먼저 접수되고, 결제 방법은 따로 안내해 드려요."}<br />
              {FREE_CANCEL_NOTICE}<br />
              펫츠로드는 통신판매중개자이며 숙박 계약의 당사자는 숙소입니다.
            </div>
            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <button onClick={submit} disabled={!step2Ready} style={primary(!step2Ready)}>{busy ? "예약하는 중…" : `${won(payTotal)} ${paymentsReady() ? "결제하기" : "예약하기"}`}</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 12, textAlign: "center", padding: isPage ? "28px 16px" : "10px 0", maxWidth: isPage ? 520 : undefined, margin: "0 auto" }}>
            <CheckCircle2 size={38} color="#3B2A20" style={{ margin: "0 auto" }} />
            <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#111" }}>{result?.status === "confirmed" ? "예약이 확정됐어요" : "예약을 보냈어요"}</div>
            <div style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.7 }}>
              {result?.status === "confirmed" ? "즐거운 여행 되세요!" : "숙소가 24시간 안에 확정해요.\n확정되지 않으면 자동으로 취소되고 전액 돌려드려요.".split("\n").map((l) => <span key={l}>{l}<br /></span>)}
              주문·예약 내역에서 확인할 수 있어요.
            </div>
            <a href="/orders?tab=stay" style={{ ...primary(false), textDecoration: "none", display: "block" }}>주문·예약 내역 보기</a>
            <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#262626", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>닫기</button>
          </div>
        )}
      </div>
  );
  if (isPage) return body;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${placeName} 예약`} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {body}
    </div>
  );
}

