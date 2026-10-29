"use client";

// 숙박 예약 창(손님용) — 장소 상세의 숙소 칸(PlaceLodgingSection)에서 객실의 [예약하기]로 엽니다.
//   ① 날짜·인원·반려동물: 객실 달력에서 체크인 → 체크아웃을 고릅니다(막은 날·찬 날은 못 고름).
//      반려동물은 한 마리씩 종류(숙소가 받는 동물만 — 강아지·고양이·그 외 동물)·크기·몸무게를 적고,
//      숙소 동반 규정에 안 맞으면 바로 알려 줍니다.
//   ② 확인: 1박씩 나눈 요금, 날짜별 환불 안내(소비자분쟁해결기준),
//      예약자(이름·휴대전화 필수, 이메일 선택)·실제 이용자(예약자와 다르면 필수)·방문 수단(필수)·도착 예정 시각·요청 사항,
//      필수 동의(이용 규칙·취소 환불 / 개인정보 수집·이용 / 숙소에 제공 / 만 14세 이상 — src/lib/lodgingConsents.ts) → 예약
//   ③ 완료: 숙소 확정을 기다리거나(24시간), 즉시 확정 숙소면 바로 확정
// variant="page"면 덮는 창 없이 숙소 예약 화면(/stay/번호/book)에 그대로 그립니다.
// 금액은 서버가 다시 계산합니다(/api/lodging/bookings). 결제대행 연동 전에는 결제 단계 없이 접수되고, 결제는 따로 안내합니다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Minus, Plus, Trash2, X } from "lucide-react";
import { breedSize, CAT_BREEDS, DOG_BREEDS, OTHER_BREED } from "@/lib/petBreeds";
import { ARRIVAL_METHODS, DANGEROUS_DOG_NOTICE, STAY_CONSENTS, type ArrivalMethod, type StayConsentId } from "@/lib/lodgingConsents";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { EXTRA_UNITS, PET_SIZES, PET_SPECIES, petPolicySummary, roomPriceText, type LodgingProfile, type PetSize, type PetSpecies, type RoomInput } from "@/lib/lodgingRules";
import { addDays, daysBetween, kstToday, nightsOf, petNightFee, petsAllowed, quoteStay, stayDayLabel, STAY_MAX_NIGHTS, BOOK_AHEAD_DAYS, type RoomDay, type StayPet } from "@/lib/lodgingBooking";
import { refundSchedule } from "@/lib/lodgingPolicy";

export type GuestRoom = RoomInput & { id: number };
type DayInfo = { day: string; price: number; closed: boolean; booked: boolean };
/** breed = 고른 견종·묘종(직접 입력이면 OTHER_BREED), breedText = 직접 입력한 이름 */
type PetForm = { species: PetSpecies; size: PetSize | ""; weight: string; kind: string; breed: string; breedText: string };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const shortWon = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만` : n.toLocaleString("ko-KR"));
const box: React.CSSProperties = { padding: "14px 14px", borderRadius: 14, background: "#F7F3E8" };
const input: React.CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6 };
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 11px", borderRadius: 999, border: `1px solid ${on ? "#1D4F91" : "#e2dcc8"}`, background: on ? "#E3EDFA" : "white", color: on ? "#1D4F91" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const stepper: React.CSSProperties = { width: 32, height: 32, padding: 0, borderRadius: 999, border: "1px solid #ddd", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#333" };
const primary = (disabled: boolean): React.CSSProperties => ({ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: disabled ? "#d6d3c9" : "#1D4F91", color: "white", fontSize: 15, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });

export default function LodgingBookingSheet({ placeName, profile, rooms, initialRoomId, onClose, variant = "sheet" }: {
  placeName: string;
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
  const newPet = (): PetForm => ({ species: speciesOptions[0]?.id ?? "dog", size: sizeOptions[0]?.id ?? "small", weight: "", kind: "", breed: "", breedText: "" });
  const setPet = (i: number, patch: Partial<PetForm>) => setPets((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // 부가 옵션 — 고른 수량(0이면 안 고름)
  const extraOptions = profile?.extras ?? [];
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  const picks = extraOptions.filter((x) => (extraQty[x.id] ?? 0) > 0).map((x) => ({ id: x.id, qty: extraQty[x.id] }));
  const [pets, setPets] = useState<PetForm[]>(() => [newPet()]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", memo: "", sameGuest: true, stayGuestName: "", stayGuestPhone: "", arrivalMethod: "" as ArrivalMethod | "", arrivalTime: "" });
  const [consents, setConsents] = useState<StayConsentId[]>([]);
  const [openConsent, setOpenConsent] = useState<StayConsentId | null>(null);
  const allAgreed = consents.length === STAY_CONSENTS.length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string } | null>(null);

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
  const stayPets: StayPet[] = pets.map((p) => ({ species: p.species, size: p.species === "dog" && p.size ? p.size : null, weight: p.weight ? Number(p.weight) : null, kind: p.species === "other" ? p.kind.trim() || null : null, breed: p.species === "other" ? null : breedOf(p) }));
  const petNightly = stayPets.reduce((sum, p) => sum + petNightFee(profile, p), 0);
  const petProblem = room ? petsAllowed(profile, room, stayPets) : null;
  const roomDays: RoomDay[] = days.map((d) => ({ day: d.day, closed: d.closed, price: d.price }));
  const quote = room && checkIn && checkOut ? quoteStay(room, petNightly, roomDays, checkIn, checkOut, guests, picks, extraOptions) : null;
  const priced = quote && !("error" in quote) ? quote : null;
  const schedule = priced && checkIn ? refundSchedule(priced.total, checkIn, today, profile?.peak_periods) : [];
  const step1Ready = !!priced && !petProblem && pets.every((p) => (p.species !== "dog" || p.size) && (p.species !== "other" ? !!breedOf(p) : !!p.kind.trim()));
  const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 9;
  const step2Ready = !!form.name.trim() && phoneOk(form.phone) && !!form.arrivalMethod && allAgreed && !busy
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
        body: JSON.stringify({ roomId: room.id, checkIn, checkOut, guests, pets: stayPets, extras: picks, ...form, consents }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "예약하지 못했어요.");
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
      <div onClick={(e) => e.stopPropagation()} style={isPage
        ? { width: "100%", background: "white", borderRadius: 20, border: "1px solid #e3eaf3", padding: "18px 18px 24px", boxSizing: "border-box", wordBreak: "keep-all" }
        : { width: "100%", maxWidth: 520, maxHeight: "92dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "18px 18px 24px", boxSizing: "border-box", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {step === 2 && <button onClick={() => setStep(1)} aria-label="이전 단계" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#888" }}>{placeName}</div>
            <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>{step === 1 ? "날짜·인원·반려동물" : step === 2 ? "예약 확인" : "예약 완료"}</div>
          </div>
          {!isPage && <button onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>}
        </div>

        {step === 1 && room && (
          <div style={{ display: "grid", gap: 14 }}>
            {rooms.length > 1 && (
              <div>
                <div style={label}>객실</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {rooms.map((r) => <button key={r.id} onClick={() => { setRoomId(r.id); setCheckIn(null); setCheckOut(null); }} aria-pressed={r.id === room.id} style={chip(r.id === room.id)}>{r.name}</button>)}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 5 }}>{roomPriceText(room)} · 기준 {room.std_guests}명 · 최대 {room.max_guests}명</div>
              </div>
            )}

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={label}>{!checkIn ? "체크인 날짜를 골라 주세요" : !checkOut ? "체크아웃 날짜를 골라 주세요" : `${stayDayLabel(checkIn)} ~ ${stayDayLabel(checkOut)} · ${daysBetween(checkIn, checkOut)}박`}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setMonth(addDays(first, -1).slice(0, 7))} disabled={month <= monthStart} aria-label="이전 달" style={{ border: "1px solid #e2e4e8", background: "white", borderRadius: 8, width: 28, height: 28, cursor: "pointer", opacity: month <= monthStart ? 0.35 : 1 }}><ChevronLeft size={13} /></button>
                  <button onClick={() => setMonth(next.slice(0, 7))} disabled={month >= lastMonth} aria-label="다음 달" style={{ border: "1px solid #e2e4e8", background: "white", borderRadius: 8, width: 28, height: 28, cursor: "pointer", opacity: month >= lastMonth ? 0.35 : 1 }}><ChevronRight size={13} /></button>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 13.5, fontWeight: 800, color: "#333", margin: "4px 0 6px" }}>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
                {WEEK.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "#DC2626" : i === 6 ? "#1D4F91" : "#999" }}>{w}</div>)}
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
                      style={{ minHeight: 48, padding: "4px 2px", borderRadius: 9, border: edge ? "2px solid #1D4F91" : "1px solid #eee", background: edge ? "#1D4F91" : inRange ? "#E3EDFA" : "white", color: edge ? "white" : ok ? "#333" : "#bbb", cursor: selectable ? "pointer" : "default", fontFamily: "inherit", textDecoration: !ok && day >= today && !edge ? "line-through" : "none" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>{Number(day.slice(8))}</div>
                      {ok && d && <div style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.8, marginTop: 1 }}>{shortWon(d.price)}</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={label}>인원 <span style={{ fontWeight: 600, color: "#aaa" }}>최대 {room.max_guests}명</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setGuests((g) => Math.max(1, g - 1))} disabled={guests <= 1} aria-label="인원 줄이기" style={{ ...stepper, opacity: guests <= 1 ? 0.4 : 1 }}><Minus size={14} /></button>
                <b style={{ minWidth: 20, textAlign: "center" }}>{guests}</b>
                <button onClick={() => setGuests((g) => Math.min(room.max_guests, g + 1))} disabled={guests >= room.max_guests} aria-label="인원 늘리기" style={{ ...stepper, opacity: guests >= room.max_guests ? 0.4 : 1 }}><Plus size={14} /></button>
              </div>
            </div>

            <div>
              <div style={label}>함께 가는 반려동물 <span style={{ fontWeight: 600, color: "#aaa" }}>정확히 적어야 입실 거부를 막을 수 있어요</span></div>
              {profile && <div style={{ fontSize: 12, color: "#1D4F91", marginBottom: 7 }}>이 숙소는 {petPolicySummary(profile)}</div>}
              <div role="note" style={{ display: "flex", gap: 6, marginBottom: 8, padding: "9px 11px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FBD5D5", fontSize: 12, color: "#991B1B", lineHeight: 1.6 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>{DANGEROUS_DOG_NOTICE}</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {pets.map((p, i) => {
                  const breeds = p.species === "dog" ? dogBreeds.map((b) => b.name) : p.species === "cat" ? CAT_BREEDS : [];
                  const fee = petNightFee(profile, { species: p.species, size: p.species === "dog" && p.size ? p.size : null });
                  return (
                  <div key={i} style={{ padding: 10, borderRadius: 12, border: "1px solid #eee", display: "grid", gap: 7 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {speciesOptions.map((s) => <button key={s.id} onClick={() => setPet(i, { species: s.id, breed: "", breedText: "" })} aria-pressed={p.species === s.id} style={chip(p.species === s.id)}>{s.label}</button>)}
                      {pets.length > 1 && <button onClick={() => setPets((all) => all.filter((_, j) => j !== i))} aria-label={`${i + 1}번째 반려동물 빼기`} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#b42318" }}><Trash2 size={15} /></button>}
                    </div>
                    {p.species !== "other" && (
                      <div style={{ display: "grid", gridTemplateColumns: p.breed === OTHER_BREED ? "1fr 1fr" : "1fr", gap: 6 }}>
                        <select value={p.breed} onChange={(e) => { const breed = e.target.value; const size = breedSize(breed); setPet(i, { breed, ...(size && sizeOptions.some((s) => s.id === size) ? { size } : {}) }); }}
                          aria-label={p.species === "dog" ? "견종" : "묘종"} style={{ ...input, color: p.breed ? "#222" : "#999" }}>
                          <option value="">{p.species === "dog" ? "견종을 골라 주세요" : "묘종을 골라 주세요"}</option>
                          {breeds.map((b) => <option key={b} value={b}>{b}</option>)}
                          <option value={OTHER_BREED}>목록에 없어요 (직접 입력)</option>
                        </select>
                        {p.breed === OTHER_BREED && <input value={p.breedText} onChange={(e) => setPet(i, { breedText: e.target.value.slice(0, 30) })} placeholder={p.species === "dog" ? "예: 꼬똥 드 툴레아" : "예: 아비시니안"} aria-label="직접 입력한 종" style={input} />}
                      </div>
                    )}
                    {p.species === "dog" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {sizeOptions.map((s) => <button key={s.id} onClick={() => setPet(i, { size: s.id })} aria-pressed={p.size === s.id} title={s.hint} style={chip(p.size === s.id)}>{s.label}</button>)}
                        {sizeOptions.length < PET_SIZES.length && <span style={{ alignSelf: "center", fontSize: 11.5, color: "#999" }}>이 숙소는 {PET_SIZES.filter((s) => !sizeOptions.includes(s)).map((s) => s.label).join("·")}을 받지 않아요</span>}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: p.species === "other" ? "1fr 1fr" : "1fr", gap: 6 }}>
                      {p.species === "other" && <input value={p.kind} onChange={(e) => setPet(i, { kind: e.target.value.slice(0, 20) })} placeholder="어떤 동물인가요? 예: 토끼" aria-label="동물 종류" style={input} />}
                      <input value={p.weight} onChange={(e) => setPet(i, { weight: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} placeholder={profile?.max_pet_weight_kg != null ? `몸무게(kg) — ${profile.max_pet_weight_kg}kg 이하` : "몸무게(kg)"} inputMode="decimal" aria-label="몸무게" style={input} />
                    </div>
                    {profile && <div style={{ fontSize: 11.5, color: "#888" }}>{fee > 0 ? `추가 요금 1박 ${won(fee)}` : "추가 요금 없음"}</div>}
                  </div>
                  );
                })}
              </div>
              {pets.length < maxPets && <button onClick={() => setPets((all) => [...all, newPet()])} style={{ marginTop: 8, border: "1px dashed #9db4d6", background: "#F2F6FC", color: "#1D4F91", borderRadius: 10, padding: "9px 0", width: "100%", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 반려동물 추가</button>}
              {petProblem && <div role="status" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{petProblem}</div>}
            </div>

            {extraOptions.length > 0 && (
              <div>
                <div style={label}>부가 옵션 <span style={{ fontWeight: 600, color: "#aaa" }}>필요한 것만 골라 주세요</span></div>
                <div style={{ display: "grid", gap: 6 }}>
                  {extraOptions.map((x) => {
                    const qty = extraQty[x.id] ?? 0;
                    const unit = EXTRA_UNITS.find((u) => u.id === x.unit);
                    return (
                      <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${qty > 0 ? "#9db4d6" : "#eee"}`, background: qty > 0 ? "#F2F6FC" : "white" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#222" }}>{x.name}</div>
                          <div style={{ fontSize: 12, color: "#777" }}>{won(x.price)} · {unit?.label}{x.note ? ` · ${x.note}` : ""}</div>
                        </div>
                        <button onClick={() => setExtraQty((q) => ({ ...q, [x.id]: Math.max(0, qty - 1) }))} disabled={qty <= 0} aria-label={`${x.name} 줄이기`} style={{ ...stepper, opacity: qty <= 0 ? 0.4 : 1 }}><Minus size={14} /></button>
                        <b style={{ minWidth: 18, textAlign: "center" }}>{qty}</b>
                        <button onClick={() => setExtraQty((q) => ({ ...q, [x.id]: Math.min(x.max, qty + 1) }))} disabled={qty >= x.max} aria-label={`${x.name} 늘리기`} style={{ ...stepper, opacity: qty >= x.max ? 0.4 : 1 }}><Plus size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {quote && "error" in quote && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{quote.error}</div>}
            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <button onClick={() => setStep(2)} disabled={!step1Ready} style={primary(!step1Ready)}>{priced ? `${won(priced.total)} · 다음` : "날짜를 골라 주세요"}</button>
          </div>
        )}

        {step === 2 && room && priced && checkIn && checkOut && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={box}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>{room.name}</div>
              <div style={{ fontSize: 12.5, color: "#555", marginTop: 4, lineHeight: 1.7 }}>
                {stayDayLabel(checkIn)} {profile?.check_in ? `${profile.check_in} 체크인` : ""} ~ {stayDayLabel(checkOut)} {profile?.check_out ? `${profile.check_out} 체크아웃` : ""}<br />
                {priced.nights.length}박 · {guests}명 · 반려동물 {pets.length}마리
              </div>
            </div>

            <div>
              <div style={label}>요금</div>
              <div style={{ display: "grid", gap: 4, fontSize: 13, color: "#555" }}>
                {priced.nights.map((n) => <div key={n.day} style={{ display: "flex", justifyContent: "space-between" }}><span>{stayDayLabel(n.day)} 1박</span><span>{won(n.price)}</span></div>)}
                {priced.extraGuestTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>인원 추가</span><span>{won(priced.extraGuestTotal)}</span></div>}
                {priced.petTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>반려동물 추가({pets.length}마리 × {priced.nights.length}박)</span><span>{won(priced.petTotal)}</span></div>}
                {priced.extras.map((x) => <div key={x.id} style={{ display: "flex", justifyContent: "space-between" }}><span>{x.name} × {x.qty}{x.unit === "night" ? ` × ${priced.nights.length}박` : ""}</span><span>{won(x.amount)}</span></div>)}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4, fontSize: 16, fontWeight: 800, color: "#1D4F91" }}><span>총 결제 금액</span><span>{won(priced.total)}</span></div>
                <div style={{ fontSize: 11.5, color: "#999" }}>현장에서 따로 내는 금액은 없어요.</div>
              </div>
            </div>

            <div>
              <div style={label}>취소하면 돌려받는 금액</div>
              <div style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>오늘({stayDayLabel(today)}) 안에 취소</span><b style={{ color: "#15803D" }}>{won(priced.total)} 전액</b></div>
                {schedule.filter((r) => r.until > today).map((r) => (
                  <div key={r.until} style={{ display: "flex", justifyContent: "space-between" }}><span>{stayDayLabel(r.until)}까지 취소</span><span style={{ fontWeight: 700, color: r.rate === 0 ? "#15803D" : "#B45309" }}>{r.rate === 0 ? `${won(r.refund)} 전액` : `${won(r.refund)} (${r.rate}% 공제)`}</span></div>
                ))}
                <div style={{ fontSize: 11.5, color: "#999", marginTop: 2 }}>공정거래위원회 소비자분쟁해결기준(숙박업)에 따릅니다. 체크인 날이 지나면 취소할 수 없어요.</div>
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
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#444", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.sameGuest} onChange={(e) => setForm((f) => ({ ...f, sameGuest: e.target.checked }))} style={{ width: 15, height: 15 }} />예약자와 같아요
                </label>
              </div>
              {!form.sameGuest && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input value={form.stayGuestName} onChange={(e) => setForm((f) => ({ ...f, stayGuestName: e.target.value.slice(0, 20) }))} placeholder="실제 이용자 이름" aria-label="실제 이용자 이름" style={input} />
                  <input value={form.stayGuestPhone} onChange={(e) => setForm((f) => ({ ...f, stayGuestPhone: e.target.value.slice(0, 13) }))} placeholder="실제 이용자 휴대전화" aria-label="실제 이용자 휴대전화" inputMode="tel" style={input} />
                </div>
              )}
              <div style={{ fontSize: 11.5, color: "#999" }}>숙소가 입실 안내·확인 연락을 드릴 분이에요.</div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={label}>방문 정보</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "#555", width: 70 }}>방문 수단 <span style={{ color: "#DC2626" }}>*</span></span>
                {ARRIVAL_METHODS.map((m) => <button key={m.id} type="button" onClick={() => setForm((f) => ({ ...f, arrivalMethod: m.id }))} aria-pressed={form.arrivalMethod === m.id} style={chip(form.arrivalMethod === m.id)}>{m.label}</button>)}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "#555", width: 70 }}>도착 예정</span>
                <input type="time" value={form.arrivalTime} onChange={(e) => setForm((f) => ({ ...f, arrivalTime: e.target.value }))} aria-label="도착 예정 시각(선택)" style={{ ...input, width: 140 }} />
                <span style={{ fontSize: 11.5, color: "#aaa" }}>선택</span>
              </div>
              <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value.slice(0, 300) }))} rows={2} placeholder="숙소에 전할 말(선택) — 예: 늦게 도착해요, 노견이라 1층 객실 부탁드려요" aria-label="요청 사항" style={{ ...input, resize: "vertical" }} />
            </div>

            <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 12px", background: "#f8fafc", fontSize: 14, fontWeight: 800, color: "#222", cursor: "pointer" }}>
                <input type="checkbox" checked={allAgreed} onChange={(e) => setConsents(e.target.checked ? STAY_CONSENTS.map((c) => c.id) : [])} style={{ width: 17, height: 17 }} />
                필수 약관 전체 동의
              </label>
              {STAY_CONSENTS.map((c) => (
                <div key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                    <input type="checkbox" id={`consent-${c.id}`} checked={consents.includes(c.id)} onChange={(e) => setConsents((all) => (e.target.checked ? [...all, c.id] : all.filter((x) => x !== c.id)))} style={{ width: 15, height: 15 }} />
                    <label htmlFor={`consent-${c.id}`} style={{ flex: 1, fontSize: 12.5, color: "#444", cursor: "pointer" }}><b style={{ color: "#DC2626" }}>[필수]</b> {c.label}</label>
                    <button type="button" onClick={() => setOpenConsent(openConsent === c.id ? null : c.id)} aria-expanded={openConsent === c.id} style={{ border: "none", background: "transparent", color: "#888", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{openConsent === c.id ? "접기" : "보기"}</button>
                  </div>
                  {openConsent === c.id && (
                    <ul style={{ margin: 0, padding: "0 14px 10px 34px", fontSize: 11.5, color: "#666", lineHeight: 1.7 }}>
                      {c.detail.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.6, padding: "10px 12px", borderRadius: 10, background: "#f8fafc" }}>
              카드 결제는 준비 중이에요. 지금은 예약이 먼저 접수되고, 결제 방법은 따로 안내해 드려요.<br />
              같이가개는 통신판매중개자이며 숙박 계약의 당사자는 숙소입니다.
            </div>
            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <button onClick={submit} disabled={!step2Ready} style={primary(!step2Ready)}>{busy ? "예약하는 중…" : `${won(priced.total)} 예약하기`}</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 12, textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 40 }}>🐾</div>
            <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#222" }}>{result?.status === "confirmed" ? "예약이 확정됐어요" : "예약을 보냈어요"}</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7 }}>
              {result?.status === "confirmed" ? "즐거운 여행 되세요!" : "숙소가 24시간 안에 확정해요.\n확정되지 않으면 자동으로 취소되고 전액 돌려드려요.".split("\n").map((l) => <span key={l}>{l}<br /></span>)}
              마이페이지 &ldquo;내 숙박 예약&rdquo;에서 확인할 수 있어요.
            </div>
            <a href="/mypage#stays" style={{ ...primary(false), textDecoration: "none", display: "block" }}>내 숙박 예약 보기</a>
            <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>닫기</button>
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

