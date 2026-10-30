// src/lib/lodgingRules.ts
//
// 숙소(반려동물 동반 숙박) 규칙 — 숙소 사장님이 올리는 "숙소 기본 정보·동반 규정"과 "객실"을 다듬습니다.
// 화면(브라우저)과 서버가 같은 규칙을 쓰도록 글자·숫자만 다루는 함수로 모았습니다(lodgingRules.test.ts).
// 표: lodging_profiles · lodging_rooms (scripts/sql/lodging.sql), 서버: /api/owner/lodging, 화면: OwnerLodgingTab.tsx
//
// 숙소에서 가장 중요한 것은 "우리 아이가 들어갈 수 있는지"입니다 — 동반 조건(종·크기·몸무게·마릿수·추가 요금)이
// 틀리면 현장에서 입실을 거부당하므로, 손님 화면(이후 단계)에서는 이 값을 그대로 크게 보여 줍니다.

import type { PeakPeriod } from "@/lib/lodgingPolicy";

// ── 동반 조건 ──

export type PetSpecies = "dog" | "cat" | "other";
/** other = 강아지·고양이 말고 숙소가 받는 동물(토끼·햄스터 등) — 어떤 동물인지는 숙소의 pet_others에 적습니다 */
export const PET_SPECIES: { id: PetSpecies; label: string }[] = [
  { id: "dog", label: "강아지" },
  { id: "cat", label: "고양이" },
  { id: "other", label: "그 외 동물" },
];

export type PetSize = "small" | "medium" | "large";
/** 반려동물 추가 요금을 따로 정할 수 있는 묶음 — 강아지는 크기별, 고양이·그 외 동물은 하나씩 */
export type PetFeeKey = PetSize | "cat" | "other";
export type PetFees = Partial<Record<PetFeeKey, number>>;
export const PET_FEE_KEYS: { id: PetFeeKey; label: string }[] = [
  { id: "small", label: "소형견" }, { id: "medium", label: "중형견" }, { id: "large", label: "대형견" }, { id: "cat", label: "고양이" }, { id: "other", label: "그 외 동물" },
];
/** 크기 기준은 숙소마다 다르므로 몸무게 예시만 붙이고, 정확한 한도는 "최대 몸무게" 칸으로 받습니다 */
export const PET_SIZES: { id: PetSize; label: string; hint: string }[] = [
  { id: "small", label: "소형견", hint: "대략 7kg 미만" },
  { id: "medium", label: "중형견", hint: "대략 7~15kg" },
  { id: "large", label: "대형견", hint: "대략 15kg 이상" },
];

/** 반려동물 편의시설 — 고르기만 하면 되는 목록(직접 적을 내용은 "동반 수칙"에) */
export const PET_AMENITIES = [
  "전용 마당·운동장", "울타리(펜스)", "반려견 수영장", "펫 샤워장", "펫 드라이룸",
  "펫 침대·방석", "식기(밥·물그릇)", "배변 패드", "배변 봉투", "반려견 수건", "리드줄 고리", "동물병원 가까움",
];

/** 객실 편의시설 */
export const ROOM_AMENITIES = [
  "개별 바비큐", "취사 가능", "개별 수영장", "스파·월풀", "개별 마당", "테라스",
  "와이파이", "주차", "에어컨", "넷플릭스·TV", "복층", "독채",
];

/** 객실 유형 예시 — 직접 적어도 됩니다 */
export const ROOM_TYPE_SUGGESTIONS = ["원룸", "투룸", "독채", "복층", "스위트", "캠핑·글램핑", "카라반"];

// ── 글자·숫자 한도 ──

export const LODGING_TEXT_MAX = 600;
export const LODGING_SHORT_MAX = 100;
export const ROOM_NAME_MAX = 30;
export const ROOM_TYPE_MAX = 20;
export const ROOM_DESC_MAX = 400;
export const ROOM_PRICE_MAX = 10_000_000;
export const ROOM_GUESTS_MAX = 30;
export const ROOM_PETS_MAX = 10;
export const ROOM_IMAGES_MAX = 6;
/** 판매 중으로 켜려면 필요한 객실 사진 수(사진 없는 숙소는 손님이 고르기 어렵습니다) */
export const ROOM_PHOTOS_MIN = 2;
/** 숙소 한 곳이 올릴 수 있는 객실 수 */
export const ROOMS_PER_PLACE_MAX = 40;
export const PET_FEE_MAX = 500_000;
export const PET_WEIGHT_MAX = 100;

// ── 숙소 기본 정보·동반 규정 ──

export type LodgingProfile = {
  /** 체크인·체크아웃 시각("15:00") */
  check_in: string | null;
  check_out: string | null;
  pet_species: PetSpecies[];
  /** "그 외 동물"을 받을 때 어떤 동물인지(예: "토끼·햄스터") */
  pet_others: string | null;
  pet_sizes: PetSize[];
  /** 한 마리 최대 몸무게(kg) — 없으면 크기 기준만 */
  max_pet_weight_kg: number | null;
  /** 한 객실 최대 마릿수(객실마다 따로 정할 수도 있음) */
  max_pets: number | null;
  /** 반려동물 추가 요금(1마리·1박, 원) — 0이면 무료, null이면 안 적음 */
  pet_fee: number | null;
  /** 크기·종류별 추가 요금(1마리·1박) — 비어 있는 칸은 pet_fee(기본)를 씁니다 */
  pet_fees: PetFees;
  /** 기본 포함 마릿수 — 이 마릿수까지는 반려동물 추가 요금 없음(예: 1이면 둘째부터 요금) */
  pet_free_count: number | null;
  /** 요금 관련 안내 문구 — ⚠ 결제에는 들어가지 않습니다. 실제 요금은 위 칸으로만 받습니다 */
  pet_fee_note: string | null;
  pet_amenities: string[];
  /** 반려동물 동반 수칙(예: 침대·소파 위 금지, 객실 내 배변 시 청소비) */
  pet_rules: string | null;
  /** 숙소 이용 수칙(소음·바비큐·흡연 등) */
  stay_rules: string | null;
  /** 취소·환불 규정 — 온라인 결제 단계에서는 소비자분쟁해결기준에 맞춰 다시 확인합니다 */
  refund_policy: string | null;
  /** 성수기 기간(비우면 소비자분쟁해결기준의 기본값 — 여름 7/15~8/24, 겨울 12/20~2/20). 취소 공제율 판단에 씁니다 */
  peak_periods: PeakPeriod[];
  /** 즉시 확정 — 켜면 손님 결제와 함께 예약이 바로 확정됩니다(계약서 제8조 제3항) */
  instant_confirm: boolean;
  /** 부가 옵션(바비큐·불멍·추가 침구 등) — 손님이 예약할 때 골라서 함께 결제 */
  extras: LodgingExtra[];
};

// ── 부가 옵션 ──
export type ExtraUnit = "stay" | "night" | "person";
export const EXTRA_UNITS: { id: ExtraUnit; label: string; hint: string }[] = [
  { id: "stay", label: "1회", hint: "숙박 한 번에" },
  { id: "night", label: "1박마다", hint: "숙박하는 밤 수만큼" },
  { id: "person", label: "1인당", hint: "고른 인원 수만큼" },
];
export type LodgingExtra = { id: string; name: string; price: number; unit: ExtraUnit; max: number; note: string | null };
export const EXTRAS_MAX = 12;
export const EXTRA_QTY_MAX = 20;
export const EXTRA_PRESETS = ["바비큐(숯·그릴)", "불멍(화로대)", "추가 침구", "조식", "얼리 체크인", "레이트 체크아웃", "반려동물 용품 대여", "온수 수영장"];
export const PEAK_PERIODS_MAX = 6;

export const EMPTY_PROFILE: LodgingProfile = {
  check_in: null, check_out: null, pet_species: ["dog"], pet_others: null, pet_sizes: ["small"], max_pet_weight_kg: null, max_pets: null,
  pet_fee: null, pet_fees: {}, pet_free_count: null, pet_fee_note: null, pet_amenities: [], pet_rules: null, stay_rules: null, refund_policy: null,
  peak_periods: [], instant_confirm: false, extras: [],
};

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]d|3[01])$/;
/** 성수기 기간 다듬기 — "MM-DD" 두 개씩, 최대 6구간. 틀린 칸이 있으면 "bad" */
function cleanPeakPeriods(value: unknown): PeakPeriod[] | "bad" {
  if (!Array.isArray(value)) return [];
  const out: PeakPeriod[] = [];
  for (const p of value as Record<string, unknown>[]) {
    const from = typeof p?.from === "string" ? p.from.trim() : "";
    const to = typeof p?.to === "string" ? p.to.trim() : "";
    if (!from && !to) continue;
    if (!MONTH_DAY.test(from) || !MONTH_DAY.test(to)) return "bad";
    out.push({ from, to });
  }
  return out.length > PEAK_PERIODS_MAX ? "bad" : out;
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const pickList = <T extends string>(value: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(value) ? allowed.filter((a) => value.includes(a)) : [];
/** 빈 값이면 null, 아니면 min~max 사이 정수(소수 허용 시 한 자리) */
function number(value: unknown, min: number, max: number, decimals = 0): number | null | "bad" {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return "bad";
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}
/** "9:00" "09:00" → "09:00", 틀리면 "bad" */
export function cleanTime(value: unknown): string | null | "bad" {
  if (value === "" || value == null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) return "bad";
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return "bad";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** 부가 옵션 다듬기 — 이름·요금 필수, 단위(1회·1박마다·1인당), 한 번에 고를 수 있는 최대 수량 */
export function cleanExtras(value: unknown): { extras: LodgingExtra[] } | { error: string } {
  if (!Array.isArray(value)) return { extras: [] };
  if (value.length > EXTRAS_MAX) return { error: `부가 옵션은 ${EXTRAS_MAX}개까지 둘 수 있어요.` };
  const out: LodgingExtra[] = [];
  for (const [i, raw] of (value as Record<string, unknown>[]).entries()) {
    const name = text(raw?.name, 30);
    const price = number(raw?.price, 0, ROOM_PRICE_MAX);
    if (!name && (price == null || price === "bad")) continue; // 빈 줄은 건너뜀
    if (!name) return { error: `${i + 1}번째 부가 옵션의 이름을 적어 주세요.` };
    if (price == null || price === "bad") return { error: `"${name}" 요금을 0 이상의 숫자로 적어 주세요.` };
    const unit = EXTRA_UNITS.find((u) => u.id === raw?.unit)?.id ?? "stay";
    const max = number(raw?.max, 1, EXTRA_QTY_MAX);
    const id = typeof raw?.id === "string" && /^[\w-]{1,24}$/.test(raw.id) ? raw.id : `x${i + 1}${Math.random().toString(36).slice(2, 7)}`;
    if (out.some((x) => x.id === id)) return { error: "부가 옵션이 겹쳐요. 다시 저장해 주세요." };
    out.push({ id, name, price, unit, max: max == null || max === "bad" ? 1 : max, note: text(raw?.note, 60) });
  }
  return { extras: out };
}

/** 숙소 기본 정보·동반 규정을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanLodgingProfile(raw: unknown): { profile: LodgingProfile } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const checkIn = cleanTime(r.check_in);
  const checkOut = cleanTime(r.check_out);
  if (checkIn === "bad" || checkOut === "bad") return { error: "체크인·체크아웃 시각을 다시 확인해 주세요. (예: 15:00)" };
  const species = pickList(r.pet_species, PET_SPECIES.map((s) => s.id));
  if (species.length === 0) return { error: "동반 가능한 반려동물을 하나 이상 골라 주세요." };
  const sizes = pickList(r.pet_sizes, PET_SIZES.map((s) => s.id));
  if (species.includes("dog") && sizes.length === 0) return { error: "받을 수 있는 강아지 크기를 하나 이상 골라 주세요." };
  const others = species.includes("other") ? text(r.pet_others, LODGING_SHORT_MAX) : null;
  if (species.includes("other") && !others) return { error: "받을 수 있는 그 외 동물을 적어 주세요. (예: 토끼·햄스터)" };
  const weight = number(r.max_pet_weight_kg, 0.5, PET_WEIGHT_MAX, 1);
  if (weight === "bad") return { error: `최대 몸무게는 0.5~${PET_WEIGHT_MAX}kg 사이로 적어 주세요.` };
  const maxPets = number(r.max_pets, 1, ROOM_PETS_MAX);
  if (maxPets === "bad") return { error: `최대 마릿수는 1~${ROOM_PETS_MAX}마리 사이로 적어 주세요.` };
  const fee = number(r.pet_fee, 0, PET_FEE_MAX);
  if (fee === "bad") return { error: "반려동물 추가 요금을 다시 확인해 주세요." };
  const freeCount = number(r.pet_free_count, 0, ROOM_PETS_MAX);
  if (freeCount === "bad") return { error: `기본 포함 마릿수는 0~${ROOM_PETS_MAX}마리 사이로 적어 주세요.` };
  const petFees: PetFees = {};
  const rawFees = (r.pet_fees ?? {}) as Record<string, unknown>;
  for (const k of PET_FEE_KEYS) {
    const v = number(rawFees[k.id], 0, PET_FEE_MAX);
    if (v === "bad") return { error: `${k.label} 추가 요금을 다시 확인해 주세요.` };
    if (v != null) petFees[k.id] = v;
  }
  const extras = cleanExtras(r.extras);
  if ("error" in extras) return extras;
  const peak = cleanPeakPeriods(r.peak_periods);
  if (peak === "bad") return { error: `성수기 기간을 다시 확인해 주세요(예: 07-15 ~ 08-24, 최대 ${PEAK_PERIODS_MAX}구간).` };
  return {
    profile: {
      check_in: checkIn, check_out: checkOut,
      pet_species: species,
      pet_others: others,
      // 고양이만 받는 숙소면 강아지 크기는 비워 둡니다
      pet_sizes: species.includes("dog") ? sizes : [],
      max_pet_weight_kg: weight, max_pets: maxPets, pet_fee: fee,
      pet_fee_note: text(r.pet_fee_note, LODGING_SHORT_MAX),
      pet_amenities: Array.isArray(r.pet_amenities) ? PET_AMENITIES.filter((a) => (r.pet_amenities as unknown[]).includes(a)) : [],
      pet_rules: text(r.pet_rules, LODGING_TEXT_MAX),
      stay_rules: text(r.stay_rules, LODGING_TEXT_MAX),
      refund_policy: text(r.refund_policy, LODGING_TEXT_MAX),
      peak_periods: peak,
      instant_confirm: r.instant_confirm === true,
      pet_fees: petFees,
      pet_free_count: freeCount,
      extras: extras.extras,
    },
  };
}

// ── 객실 ──

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export type RoomInput = {
  name: string;
  room_type: string | null;
  description: string | null;
  /** 1박 요금(일~목) */
  base_price: number;
  /** 1박 요금(금·토) — 없으면 평일 요금과 같음 */
  weekend_price: number | null;
  /** 요일별 1박 요금 [일, 월, 화, 수, 목, 금, 토] — 적은 요일은 평일·주말 요금 대신 이 값(손님 적은 요일은 낮게, 많은 요일은 높게) */
  weekday_prices?: (number | null)[] | null;
  /** 기준 인원 / 최대 인원 / 기준 초과 1명당 추가 요금 */
  std_guests: number;
  max_guests: number;
  extra_guest_fee: number | null;
  /** 이 객실 최대 마릿수 — 없으면 숙소 기본 규정을 따름 */
  max_pets: number | null;
  images: string[];
  amenities: string[];
  /** 판매 중(꺼 두면 손님에게 숨김) */
  is_active: boolean;
};

/** 객실 입력값을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanRoom(raw: unknown): { room: RoomInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "객실 이름을 적어 주세요." };
  if (name.length > ROOM_NAME_MAX) return { error: `객실 이름은 ${ROOM_NAME_MAX}자까지예요.` };
  const base = number(r.base_price, 0, ROOM_PRICE_MAX);
  if (base === null || base === "bad") return { error: "1박 요금(평일)을 0 이상의 숫자로 적어 주세요." };
  const weekend = number(r.weekend_price, 0, ROOM_PRICE_MAX);
  if (weekend === "bad") return { error: "주말 요금을 다시 확인해 주세요." };
  const std = number(r.std_guests, 1, ROOM_GUESTS_MAX);
  const max = number(r.max_guests, 1, ROOM_GUESTS_MAX);
  if (std === null || std === "bad" || max === null || max === "bad") return { error: `기준·최대 인원은 1~${ROOM_GUESTS_MAX}명 사이로 적어 주세요.` };
  if (max < std) return { error: "최대 인원은 기준 인원보다 적을 수 없어요." };
  const weekdayPrices: (number | null)[] = [];
  const rawWeekday = Array.isArray(r.weekday_prices) ? r.weekday_prices : [];
  for (let d = 0; d < 7; d++) {
    const v = number(rawWeekday[d], 0, ROOM_PRICE_MAX);
    if (v === "bad") return { error: `${WEEKDAY_LABELS[d]}요일 요금을 다시 확인해 주세요.` };
    weekdayPrices.push(v);
  }
  const extra = number(r.extra_guest_fee, 0, ROOM_PRICE_MAX);
  if (extra === "bad") return { error: "인원 추가 요금을 다시 확인해 주세요." };
  const pets = number(r.max_pets, 1, ROOM_PETS_MAX);
  if (pets === "bad") return { error: `최대 마릿수는 1~${ROOM_PETS_MAX}마리 사이로 적어 주세요.` };
  const images = Array.isArray(r.images) ? r.images.filter((u): u is string => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u)) : [];
  if (images.length > ROOM_IMAGES_MAX) return { error: `객실 사진은 ${ROOM_IMAGES_MAX}장까지 올릴 수 있어요.` };
  if (r.is_active !== false && images.length < ROOM_PHOTOS_MIN) return { error: `객실 사진을 ${ROOM_PHOTOS_MIN}장 이상 올려야 판매할 수 있어요. 사진을 더 올리거나 "판매 중지"로 저장해 주세요.` };
  return {
    room: {
      name,
      room_type: text(r.room_type, ROOM_TYPE_MAX),
      description: text(r.description, ROOM_DESC_MAX),
      base_price: base,
      weekend_price: weekend,
      // 하나도 안 적었으면 null(평일·주말 요금만 씀)
      weekday_prices: weekdayPrices.some((v) => v != null) ? weekdayPrices : null,
      std_guests: std, max_guests: max,
      extra_guest_fee: max > std ? extra : null,
      max_pets: pets,
      images,
      amenities: Array.isArray(r.amenities) ? ROOM_AMENITIES.filter((a) => (r.amenities as unknown[]).includes(a)) : [],
      is_active: r.is_active !== false,
    },
  };
}

// ── 손님에게 보여 줄 요약 ──

/** "강아지(소형견·중형견, 10kg 이하)·고양이 · 최대 2마리 · 1마리 1박 1만 원" 같은 한 줄 요약 */
export function petPolicySummary(p: Pick<LodgingProfile, "pet_species" | "pet_sizes" | "max_pet_weight_kg" | "max_pets" | "pet_fee"> & { pet_others?: string | null; pet_fees?: PetFees; pet_free_count?: number | null }): string {
  const parts: string[] = [];
  const animals = p.pet_species.map((s) => {
    if (s === "other") return p.pet_others || "그 외 동물";
    if (s !== "dog") return PET_SPECIES.find((x) => x.id === s)?.label ?? s;
    const sizes = PET_SIZES.filter((x) => p.pet_sizes.includes(x.id)).map((x) => x.label);
    const limits = [sizes.length === PET_SIZES.length ? "크기 무관" : sizes.join("·"), p.max_pet_weight_kg != null ? `${p.max_pet_weight_kg}kg 이하` : ""].filter(Boolean);
    return `강아지${limits.length ? `(${limits.join(", ")})` : ""}`;
  });
  if (animals.length) parts.push(animals.join("·"));
  if (p.max_pets != null) parts.push(`최대 ${p.max_pets}마리`);
  // 크기·종류별 요금이 있으면 "1마리 1박 소형견 1만 원·대형견 2만 원"처럼
  const byKind = PET_FEE_KEYS.filter((k) => p.pet_fees?.[k.id] != null && p.pet_fees[k.id] !== p.pet_fee).map((k) => `${k.label} ${p.pet_fees![k.id]!.toLocaleString("ko-KR")}원`);
  if (byKind.length > 0) parts.push(`1마리 1박 ${p.pet_fee != null ? `기본 ${p.pet_fee.toLocaleString("ko-KR")}원·` : ""}${byKind.join("·")}`);
  else if (p.pet_fee === 0) parts.push("추가 요금 없음");
  else if (p.pet_fee != null) parts.push(`1마리 1박 ${p.pet_fee.toLocaleString("ko-KR")}원`);
  if ((p.pet_free_count ?? 0) > 0 && p.pet_fee !== 0) parts.push(`${p.pet_free_count}마리까지 추가 요금 없음`);
  return parts.join(" · ");
}

/** 객실의 가장 낮은 1박 요금(요일별 요금 포함) — "1박 ○원~" 표시용 */
export function roomLowestPrice(room: Pick<RoomInput, "base_price" | "weekend_price" | "weekday_prices">): number {
  return Math.min(room.base_price, ...(room.weekday_prices ?? []).filter((v): v is number => v != null));
}

/** 손님 화면용 1박 요금 문구 — "1박 120,000원부터" (주말이 더 비싸면 "주말 150,000원") */
export function roomPriceText(room: Pick<RoomInput, "base_price" | "weekend_price" | "weekday_prices">): string {
  // 요일별 요금이 있으면 가장 낮은 요금부터
  const byDay = (room.weekday_prices ?? []).filter((v): v is number => v != null);
  if (byDay.length > 0) return `1박 ${Math.min(room.base_price, ...byDay).toLocaleString("ko-KR")}원부터 · 요일별 요금`;
  const base = `1박 ${room.base_price.toLocaleString("ko-KR")}원`;
  return room.weekend_price != null && room.weekend_price !== room.base_price
    ? `${base} · 주말 ${room.weekend_price.toLocaleString("ko-KR")}원`
    : base;
}
