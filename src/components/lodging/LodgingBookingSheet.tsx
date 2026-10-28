"use client";

// 숙박 예약 창(손님용) — 장소 상세의 숙소 칸(PlaceLodgingSection)에서 객실의 [예약하기]로 엽니다.
//   ① 날짜·인원·반려동물: 객실 달력에서 체크인 → 체크아웃을 고릅니다(막은 날·찬 날은 못 고름).
//      반려동물은 한 마리씩 종류·크기·몸무게·이름을 적고, 숙소 동반 규정에 안 맞으면 바로 알려 줍니다.
//   ② 확인: 1박씩 나눈 요금, 날짜별 환불 안내(소비자분쟁해결기준), 예약자 정보, 규정 동의 → 예약
//   ③ 완료: 숙소 확정을 기다리거나(24시간), 즉시 확정 숙소면 바로 확정
// 금액은 서버가 다시 계산합니다(/api/lodging/bookings). 결제대행 연동 전에는 결제 단계 없이 접수되고, 결제는 따로 안내합니다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { PET_SIZES, PET_SPECIES, roomPriceText, type LodgingProfile, type PetSize, type PetSpecies, type RoomInput } from "@/lib/lodgingRules";
import { addDays, daysBetween, kstToday, nightsOf, petsAllowed, quoteStay, stayDayLabel, STAY_MAX_NIGHTS, BOOK_AHEAD_DAYS, type RoomDay, type StayPet } from "@/lib/lodgingBooking";
import { refundSchedule } from "@/lib/lodgingPolicy";

export type GuestRoom = RoomInput & { id: number };
type DayInfo = { day: string; price: number; closed: boolean; booked: boolean };
type PetForm = { species: PetSpecies; size: PetSize | ""; weight: string; name: string };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const shortWon = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만` : n.toLocaleString("ko-KR"));
const box: React.CSSProperties = { padding: "14px 14px", borderRadius: 14, background: "#F7F3E8" };
const input: React.CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6 };
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 11px", borderRadius: 999, border: `1px solid ${on ? "#1D4F91" : "#e2dcc8"}`, background: on ? "#E3EDFA" : "white", color: on ? "#1D4F91" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const primary = (disabled: boolean): React.CSSProperties => ({ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: disabled ? "#d6d3c9" : "#1D4F91", color: "white", fontSize: 15, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });

export default function LodgingBookingSheet({ placeName, profile, rooms, initialRoomId, onClose }: {
  placeName: string;
  profile: LodgingProfile | null;
  rooms: GuestRoom[];
  initialRoomId: number;
  onClose: () => void;
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
  const [pets, setPets] = useState<PetForm[]>([{ species: profile?.pet_species?.[0] ?? "dog", size: profile?.pet_sizes?.[0] ?? "small", weight: "", name: "" }]);
  const [form, setForm] = useState({ name: "", phone: "", memo: "" });
  const [agreed, setAgreed] = useState(false);
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

  const stayPets: StayPet[] = pets.map((p) => ({ species: p.species, size: p.species === "dog" && p.size ? p.size : null, weight: p.weight ? Number(p.weight) : null, name: p.name.trim() || null }));
  const petProblem = room ? petsAllowed(profile, room, stayPets) : null;
  const roomDays: RoomDay[] = days.map((d) => ({ day: d.day, closed: d.closed, price: d.price }));
  const quote = room && checkIn && checkOut ? quoteStay(room, profile?.pet_fee ?? null, roomDays, checkIn, checkOut, guests, pets.length) : null;
  const priced = quote && !("error" in quote) ? quote : null;
  const schedule = priced && checkIn ? refundSchedule(priced.total, checkIn, today, profile?.peak_periods) : [];
  const step1Ready = !!priced && !petProblem && pets.every((p) => p.species !== "dog" || p.size);
  const step2Ready = form.name.trim() && form.phone.replace(/\D/g, "").length >= 9 && agreed && !busy;
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
        body: JSON.stringify({ roomId: room.id, checkIn, checkOut, guests, pets: stayPets, ...form, agreed: true }),
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

  return (
    <div role="dialog" aria-modal="true" aria-label={`${placeName} 예약`} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "92dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "18px 18px 24px", boxSizing: "border-box", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {step === 2 && <button onClick={() => setStep(1)} aria-label="이전 단계" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#888" }}>{placeName}</div>
            <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>{step === 1 ? "날짜·인원·반려동물" : step === 2 ? "예약 확인" : "예약 완료"}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
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
                <button onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="인원 줄이기" style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid #ddd", background: "white", cursor: "pointer" }}><Minus size={13} /></button>
                <b style={{ minWidth: 20, textAlign: "center" }}>{guests}</b>
                <button onClick={() => setGuests((g) => Math.min(room.max_guests, g + 1))} aria-label="인원 늘리기" style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid #ddd", background: "white", cursor: "pointer" }}><Plus size={13} /></button>
              </div>
            </div>

            <div>
              <div style={label}>함께 가는 반려동물 <span style={{ fontWeight: 600, color: "#aaa" }}>정확히 적어야 입실 거부를 막을 수 있어요</span></div>
              <div style={{ display: "grid", gap: 8 }}>
                {pets.map((p, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: 12, border: "1px solid #eee", display: "grid", gap: 7 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {PET_SPECIES.map((s) => <button key={s.id} onClick={() => setPets((all) => all.map((x, j) => (j === i ? { ...x, species: s.id } : x)))} aria-pressed={p.species === s.id} style={chip(p.species === s.id)}>{s.label}</button>)}
                      {pets.length > 1 && <button onClick={() => setPets((all) => all.filter((_, j) => j !== i))} aria-label={`${i + 1}번째 반려동물 빼기`} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#b42318" }}><Trash2 size={15} /></button>}
                    </div>
                    {p.species === "dog" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {PET_SIZES.map((s) => <button key={s.id} onClick={() => setPets((all) => all.map((x, j) => (j === i ? { ...x, size: s.id } : x)))} aria-pressed={p.size === s.id} style={chip(p.size === s.id)}>{s.label}</button>)}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <input value={p.weight} onChange={(e) => setPets((all) => all.map((x, j) => (j === i ? { ...x, weight: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) } : x)))} placeholder="몸무게(kg)" inputMode="decimal" style={input} />
                      <input value={p.name} onChange={(e) => setPets((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 20) } : x)))} placeholder="이름(선택)" style={input} />
                    </div>
                  </div>
                ))}
              </div>
              {pets.length < maxPets && <button onClick={() => setPets((all) => [...all, { species: "dog", size: "small", weight: "", name: "" }])} style={{ marginTop: 8, border: "1px dashed #9db4d6", background: "#F2F6FC", color: "#1D4F91", borderRadius: 10, padding: "9px 0", width: "100%", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 반려동물 추가</button>}
              {petProblem && <div role="status" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{petProblem}</div>}
            </div>

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
                {priced.petTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>반려동물 추가</span><span>{won(priced.petTotal)}</span></div>}
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
              <div style={label}>예약자</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 20) }))} placeholder="이름" style={input} />
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.slice(0, 13) }))} placeholder="휴대전화" inputMode="tel" style={input} />
              </div>
              <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value.slice(0, 300) }))} rows={2} placeholder="숙소에 전할 말(선택) — 예: 늦게 도착해요, 노견이라 1층 객실 부탁드려요" style={{ ...input, resize: "vertical" }} />
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#444", lineHeight: 1.6, cursor: "pointer" }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
              <span>위 취소·환불 규정과 숙소의 반려동물 동반 조건을 확인했어요.<br />반려동물 정보를 사실과 다르게 적어 입실이 거부되면 당일 취소로 처리돼요.</span>
            </label>

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
    </div>
  );
}
