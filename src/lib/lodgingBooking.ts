// src/lib/lodgingBooking.ts
//
// 숙소 예약 규칙 — 예약 달력(막은 날·날짜별 요금)과 손님의 예약 요청, 예약 상태가 어떻게 바뀔 수 있는지.
// 화면(브라우저)과 서버가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다(lodgingBooking.test.ts).
// 표: lodging_room_days · lodging_bookings (scripts/sql/lodging-bookings.sql)
//
// 지금 단계는 "예약 요청 → 사장님 확정" 방식이고 결제는 숙소에서 직접 합니다(온라인 결제는 PG 계약 후).
// 날짜는 모두 한국 날짜 문자열("2026-11-07")로 다룹니다. 1박 = 체크인 날짜의 밤 하나입니다.

import { ARRIVAL_METHODS, STAY_CONSENTS, type ArrivalMethod, type StayConsentId } from "@/lib/lodgingConsents";
import type { LodgingProfile, PetSize, PetSpecies, RoomInput } from "@/lib/lodgingRules";
import { PET_SIZES, PET_SPECIES, PET_WEIGHT_MAX } from "@/lib/lodgingRules";

/** 한 번에 묵을 수 있는 최대 박 수 / 며칠 뒤까지 예약을 받는지 */
export const STAY_MAX_NIGHTS = 14;
export const BOOK_AHEAD_DAYS = 180;
/** 한 손님이 한 숙소에 동시에 걸어 둘 수 있는 진행 중인 예약 수 */
export const OPEN_STAYS_PER_GUEST = 2;
export const STAY_PETS_MAX = 10;

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 기준 오늘 날짜 */
export function kstToday(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}
/** 날짜 문자열이 실제로 있는 날인지 */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS);
}
/** 묵는 밤들(체크인 날짜부터 체크아웃 전날까지) */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const n = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}
/** 금·토요일 밤은 주말 요금 */
export function isWeekendNight(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6;
}
/** 두 기간이 겹치는지(체크아웃 날 = 다음 손님 체크인 날은 겹치지 않음) */
export function staysOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

// ── 달력(사장님이 막은 날·날짜별 요금) ──

export type RoomDay = { day: string; closed: boolean; price: number | null };

/** 그 밤의 1박 요금 — 날짜별 요금이 있으면 그 값, 없으면 평일/주말 요금 */
export function nightPrice(room: Pick<RoomInput, "base_price" | "weekend_price">, day: string, override?: RoomDay | null): number {
  if (override?.price != null) return override.price;
  return isWeekendNight(day) && room.weekend_price != null ? room.weekend_price : room.base_price;
}

// ── 손님 예약 요청 ──

/** kind = "그 외 동물"일 때 어떤 동물인지(예: 토끼). name은 예전 예약에만 있습니다(이제 이름은 받지 않음) */
export type StayPet = { species: PetSpecies; size: PetSize | null; weight: number | null; kind?: string | null; name?: string | null };
export type StayRequest = {
  roomId: number; checkIn: string; checkOut: string; guests: number; pets: StayPet[];
  name: string; phone: string; memo: string | null;
  /** 예약자 이메일(선택) */
  email: string | null;
  /** 실제 이용자(투숙 대표자) — 예약자와 같으면 null */
  stayGuestName: string | null; stayGuestPhone: string | null;
  arrivalMethod: ArrivalMethod; arrivalTime: string | null;
  /** 동의한 항목(모두 필수) */
  consents: StayConsentId[];
};

/** 손님이 보낸 예약 요청을 다듬습니다(날짜·인원·반려동물·연락처). 문제가 있으면 이유를 돌려줍니다. */
export function cleanStayRequest(raw: unknown, now = Date.now()): { request: StayRequest } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const roomId = Number(r.roomId);
  if (!Number.isInteger(roomId) || roomId <= 0) return { error: "객실을 골라 주세요." };
  if (!isDay(r.checkIn) || !isDay(r.checkOut)) return { error: "체크인·체크아웃 날짜를 골라 주세요." };
  const today = kstToday(now);
  if (r.checkIn < today) return { error: "지난 날짜는 예약할 수 없어요." };
  if (daysBetween(today, r.checkIn) > BOOK_AHEAD_DAYS) return { error: `${BOOK_AHEAD_DAYS}일 안의 날짜로 골라 주세요.` };
  const nights = daysBetween(r.checkIn, r.checkOut);
  if (nights < 1) return { error: "체크아웃은 체크인 다음 날 이후로 골라 주세요." };
  if (nights > STAY_MAX_NIGHTS) return { error: `한 번에 ${STAY_MAX_NIGHTS}박까지 예약할 수 있어요.` };
  const guests = Number(r.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 30) return { error: "인원을 다시 확인해 주세요." };

  if (!Array.isArray(r.pets) || r.pets.length === 0) return { error: "함께하는 반려동물 정보를 적어 주세요." };
  if (r.pets.length > STAY_PETS_MAX) return { error: `반려동물은 ${STAY_PETS_MAX}마리까지 적을 수 있어요.` };
  const pets: StayPet[] = [];
  for (const p of r.pets as Record<string, unknown>[]) {
    const species = PET_SPECIES.find((s) => s.id === p?.species)?.id;
    if (!species) return { error: "반려동물 종류를 골라 주세요." };
    const size = species === "dog" ? PET_SIZES.find((s) => s.id === p?.size)?.id ?? null : null;
    if (species === "dog" && !size) return { error: "강아지 크기를 골라 주세요." };
    const weight = p?.weight === "" || p?.weight == null ? null : Number(p.weight);
    if (weight != null && (!Number.isFinite(weight) || weight <= 0 || weight > PET_WEIGHT_MAX)) return { error: "몸무게를 다시 확인해 주세요." };
    const kind = species === "other" && typeof p?.kind === "string" && p.kind.trim() ? p.kind.trim().slice(0, 20) : null;
    if (species === "other" && !kind) return { error: "어떤 동물인지 적어 주세요. (예: 토끼)" };
    pets.push({ species, size, weight: weight == null ? null : Math.round(weight * 10) / 10, kind });
  }

  const name = typeof r.name === "string" ? r.name.trim().slice(0, 20) : "";
  if (!name) return { error: "예약자 이름을 적어 주세요." };
  const phone = typeof r.phone === "string" ? r.phone.replace(/\D/g, "") : "";
  if (phone.length < 9 || phone.length > 11) return { error: "연락받을 전화번호를 확인해 주세요." };
  const memo = typeof r.memo === "string" && r.memo.trim() ? r.memo.trim().slice(0, 300) : null;

  const email = typeof r.email === "string" && r.email.trim() ? r.email.trim().slice(0, 120) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 주소를 다시 확인해 주세요." };
  let stayGuestName: string | null = null, stayGuestPhone: string | null = null;
  if (r.sameGuest === false) {
    stayGuestName = typeof r.stayGuestName === "string" ? r.stayGuestName.trim().slice(0, 20) : "";
    if (!stayGuestName) return { error: "실제 이용하시는 분의 이름을 적어 주세요." };
    stayGuestPhone = typeof r.stayGuestPhone === "string" ? r.stayGuestPhone.replace(/\D/g, "") : "";
    if (stayGuestPhone.length < 9 || stayGuestPhone.length > 11) return { error: "실제 이용하시는 분의 전화번호를 확인해 주세요." };
  }
  const arrivalMethod = ARRIVAL_METHODS.find((m) => m.id === r.arrivalMethod)?.id;
  if (!arrivalMethod) return { error: "방문 수단(차량·도보)을 골라 주세요." };
  const arrivalTime = typeof r.arrivalTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.arrivalTime) ? r.arrivalTime : null;
  const agreed = Array.isArray(r.consents) ? STAY_CONSENTS.filter((c) => (r.consents as unknown[]).includes(c.id)).map((c) => c.id) : [];
  if (agreed.length !== STAY_CONSENTS.length) return { error: "필수 동의 항목에 모두 동의해 주세요." };
  return { request: { roomId, checkIn: r.checkIn, checkOut: r.checkOut, guests, pets, name, phone, memo, email, stayGuestName, stayGuestPhone, arrivalMethod, arrivalTime, consents: agreed } };
}

/** 이 반려동물들이 숙소·객실 규정에 맞는지 — 안 맞으면 이유 */
export function petsAllowed(
  profile: Pick<LodgingProfile, "pet_species" | "pet_sizes" | "max_pet_weight_kg" | "max_pets"> | null,
  room: Pick<RoomInput, "max_pets">,
  pets: StayPet[],
): string | null {
  if (!profile) return null; // 동반 규정을 아직 안 적은 숙소 — 사장님이 확정할 때 직접 판단
  const maxPets = room.max_pets ?? profile.max_pets;
  if (maxPets != null && pets.length > maxPets) return `이 객실은 반려동물 ${maxPets}마리까지 동반할 수 있어요.`;
  for (const p of pets) {
    if (!profile.pet_species.includes(p.species)) return `이 숙소는 ${PET_SPECIES.find((s) => s.id === p.species)?.label ?? "이 동물"}과(와) 동반할 수 없어요.`;
    if (p.species === "dog" && p.size && !profile.pet_sizes.includes(p.size)) return `이 숙소는 ${PET_SIZES.find((s) => s.id === p.size)?.label}을(를) 받지 않아요.`;
    if (p.weight != null && profile.max_pet_weight_kg != null && p.weight > profile.max_pet_weight_kg) return `이 숙소는 ${profile.max_pet_weight_kg}kg 이하 반려동물만 동반할 수 있어요.`;
  }
  return null;
}

export type StayQuote = {
  nights: { day: string; price: number }[];
  roomTotal: number;
  extraGuestTotal: number;
  petTotal: number;
  total: number;
};

/**
 * 예약 금액 계산 — 숙소가 올린 요금으로 다시 계산합니다(손님이 보낸 금액은 믿지 않음).
 * 막은 날이 끼어 있거나 인원이 넘치면 이유를 돌려줍니다.
 */
export function quoteStay(
  room: Pick<RoomInput, "base_price" | "weekend_price" | "std_guests" | "max_guests" | "extra_guest_fee">,
  petFee: number | null,
  days: RoomDay[],
  checkIn: string,
  checkOut: string,
  guests: number,
  petCount: number,
): StayQuote | { error: string } {
  if (guests > room.max_guests) return { error: `이 객실은 최대 ${room.max_guests}명까지 이용할 수 있어요.` };
  const byDay = new Map(days.map((d) => [d.day, d]));
  const nights = nightsOf(checkIn, checkOut).map((day) => ({ day, override: byDay.get(day) ?? null }));
  const closed = nights.find((n) => n.override?.closed);
  if (closed) return { error: `${closed.day.slice(5).replace("-", "월 ")}일은 예약을 받지 않는 날이에요. 다른 날짜를 골라 주세요.` };
  const priced = nights.map((n) => ({ day: n.day, price: nightPrice(room, n.day, n.override) }));
  const roomTotal = priced.reduce((s, n) => s + n.price, 0);
  const extraGuestTotal = Math.max(0, guests - room.std_guests) * (room.extra_guest_fee ?? 0) * priced.length;
  const petTotal = (petFee ?? 0) * petCount * priced.length;
  return { nights: priced, roomTotal, extraGuestTotal, petTotal, total: roomTotal + extraGuestTotal + petTotal };
}

// ── 예약 상태 ──

export type StayStatus = "requested" | "confirmed" | "declined" | "cancelled_by_guest" | "cancelled_by_owner" | "completed" | "no_show";
export const STAY_STATUS: Record<StayStatus, { label: string; color: string; background: string }> = {
  requested: { label: "확인 대기", color: "#B45309", background: "#FEF3C7" },
  confirmed: { label: "예약 확정", color: "#15803D", background: "#DCFCE7" },
  declined: { label: "거절", color: "#777", background: "#f1f2f4" },
  cancelled_by_guest: { label: "손님 취소", color: "#777", background: "#f1f2f4" },
  cancelled_by_owner: { label: "숙소 취소", color: "#B91C1C", background: "#FEE2E2" },
  completed: { label: "이용 완료", color: "#1D4F91", background: "#E3EDFA" },
  no_show: { label: "노쇼", color: "#B91C1C", background: "#FEE2E2" },
};
const OWNER_NEXT: Partial<Record<StayStatus, StayStatus[]>> = {
  requested: ["confirmed", "declined"],
  // 이용 완료는 손님의 이용 확정(또는 체크아웃 3일 뒤 자동 확정)으로만 됩니다 — 계약서 제10조
  confirmed: ["no_show", "cancelled_by_owner"],
};
const GUEST_NEXT: Partial<Record<StayStatus, StayStatus[]>> = {
  requested: ["cancelled_by_guest"],
  confirmed: ["cancelled_by_guest", "completed"],
};
export function canChangeStay(by: "owner" | "guest", from: StayStatus, to: StayStatus): boolean {
  return (by === "owner" ? OWNER_NEXT : GUEST_NEXT)[from]?.includes(to) ?? false;
}
export const ownerNextStays = (from: StayStatus): StayStatus[] => OWNER_NEXT[from] ?? [];
/** 방을 차지하는 예약(겹치는 예약을 막을 때 봄) */
export const holdsRoom = (status: StayStatus) => status === "confirmed";
/** 아직 끝나지 않은 예약 */
export const isOpenStay = (status: StayStatus) => status === "requested" || status === "confirmed";

// ── 화면 표시 ──

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** "11/7(토)" */
export function stayDayLabel(day: string): string {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
}
/** "강아지 소형견 5kg" · "토끼 2kg" (예전 예약은 이름도 붙음) */
export function petLabel(p: StayPet): string {
  return [
    p.species === "other" && p.kind ? p.kind : PET_SPECIES.find((s) => s.id === p.species)?.label,
    p.size ? PET_SIZES.find((s) => s.id === p.size)?.label : null,
    p.weight != null ? `${p.weight}kg` : null,
    p.name ? `'${p.name}'` : null,
  ].filter(Boolean).join(" ");
}
