// src/lib/petRequirements.ts
//
// 숙소의 입실 조건·동반 규칙 — 몸무게·마릿수 말고 숙소들이 실제로 요구하는 것들을 같은 기준으로 정리합니다.
// 사장님이 고른 항목만 손님에게 보이고, 손님은 예약할 때 항목마다 확인합니다(현장 입실 거부를 줄이기 위해).
// 표: lodging_profiles.pet_requirements(scripts/sql/lodging-pet-requirements.sql)

export type PetVaccine = "rabies" | "combo";
export const PET_VACCINES: { id: PetVaccine; label: string }[] = [
  { id: "rabies", label: "광견병" },
  { id: "combo", label: "종합백신" },
];

/** 켜고 끄기만 하는 항목 */
export type PetRequirementFlag =
  | "registration" | "neutered" | "no_dangerous_breeds" | "no_aggressive"
  | "no_unattended" | "no_bed" | "own_bedding" | "manner_belt"
  | "leash" | "carrier_common" | "no_dining" | "damage_liability";

export type PetRequirements = Partial<Record<PetRequirementFlag, boolean>> & {
  vaccines?: PetVaccine[];
  /** 접종 인정 기간(년) */
  vaccine_years?: number | null;
  /** 입실 가능한 최소 나이(개월) */
  min_age_months?: number | null;
  /** 최대 체고(cm) */
  max_height_cm?: number | null;
};

type Group = "entry" | "room" | "common" | "cost";
export const PET_REQUIREMENT_GROUPS: { id: Group; title: string }[] = [
  { id: "entry", title: "입실 조건" },
  { id: "room", title: "객실 이용" },
  { id: "common", title: "공용 공간" },
  { id: "cost", title: "비용 책임" },
];

export const PET_REQUIREMENT_FLAGS: { id: PetRequirementFlag; group: Group; owner: string; guest: string }[] = [
  { id: "registration", group: "entry", owner: "동물등록 완료", guest: "동물등록을 마친 반려동물만 입실할 수 있어요." },
  { id: "neutered", group: "entry", owner: "중성화 완료", guest: "중성화를 마친 반려동물만 입실할 수 있어요." },
  { id: "no_dangerous_breeds", group: "entry", owner: "법정 맹견 입실 불가", guest: "법정 맹견은 입실할 수 없어요." },
  { id: "no_aggressive", group: "entry", owner: "공격성·심한 짖음 제한", guest: "공격성이 있거나 심하게 짖으면 입실이 제한될 수 있어요." },
  { id: "no_unattended", group: "room", owner: "객실에 혼자 두기 금지", guest: "외출할 때 반려동물을 객실에 혼자 둘 수 없어요." },
  { id: "no_bed", group: "room", owner: "침대·소파 올리기 금지", guest: "침대와 소파에 올리거나 사람 침구를 함께 쓸 수 없어요." },
  { id: "own_bedding", group: "room", owner: "전용 침구·방석 지참", guest: "반려동물 전용 침구나 방석을 챙겨 와야 해요." },
  { id: "manner_belt", group: "room", owner: "실내 매너벨트·기저귀", guest: "실내에서는 매너벨트나 기저귀를 착용해야 해요." },
  { id: "leash", group: "common", owner: "객실 밖 리드줄 필수", guest: "객실 밖에서는 리드줄을 착용해야 해요." },
  { id: "carrier_common", group: "common", owner: "공용 공간 이동장·유모차", guest: "복도와 엘리베이터에서는 이동장·유모차를 쓰거나 안고 이동해야 해요." },
  { id: "no_dining", group: "common", owner: "식당·식음 공간 출입 금지", guest: "식당 등 식음 공간에는 함께 들어갈 수 없어요." },
  { id: "damage_liability", group: "cost", owner: "파손·오염 시 배상", guest: "시설을 파손하거나 오염시키면 배상을 요청받을 수 있어요." },
];

export const PET_AGE_MONTHS_MAX = 240;
export const PET_HEIGHT_CM_MAX = 150;
export const VACCINE_YEARS_MAX = 5;

const whole = (value: unknown, min: number, max: number): number | null | "bad" => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : "bad";
};

/** 사장님이 보낸 값을 다듬습니다. 꺼진 항목은 저장하지 않습니다. */
export function cleanPetRequirements(raw: unknown): { requirements: PetRequirements } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const age = whole(r.min_age_months, 1, PET_AGE_MONTHS_MAX);
  if (age === "bad") return { error: `입실 가능 나이는 1~${PET_AGE_MONTHS_MAX}개월로 적어 주세요.` };
  const height = whole(r.max_height_cm, 5, PET_HEIGHT_CM_MAX);
  if (height === "bad") return { error: `최대 체고는 5~${PET_HEIGHT_CM_MAX}cm로 적어 주세요.` };
  const years = whole(r.vaccine_years, 1, VACCINE_YEARS_MAX);
  if (years === "bad") return { error: `접종 인정 기간은 1~${VACCINE_YEARS_MAX}년으로 적어 주세요.` };
  const vaccines = Array.isArray(r.vaccines) ? PET_VACCINES.map((v) => v.id).filter((id) => (r.vaccines as unknown[]).includes(id)) : [];
  const requirements: PetRequirements = {};
  for (const f of PET_REQUIREMENT_FLAGS) if (r[f.id] === true) requirements[f.id] = true;
  if (vaccines.length > 0) {
    requirements.vaccines = vaccines;
    if (years != null) requirements.vaccine_years = years;
  }
  if (age != null) requirements.min_age_months = age;
  if (height != null) requirements.max_height_cm = height;
  return { requirements };
}

export type PetRequirementItem = { id: string; group: Group; text: string };

/** 손님에게 보여 주고 예약할 때 확인받을 항목 */
export function petRequirementItems(r: PetRequirements | null | undefined): PetRequirementItem[] {
  if (!r) return [];
  const items: PetRequirementItem[] = [];
  if (r.vaccines?.length) {
    const names = r.vaccines.map((id) => PET_VACCINES.find((v) => v.id === id)?.label).filter(Boolean).join("·");
    items.push({ id: "vaccines", group: "entry", text: `${r.vaccine_years ? `${r.vaccine_years}년 안에 받은 ` : ""}${names} 접종 증명(수첩·확인서)을 가져와야 해요.` });
  }
  if (r.min_age_months) items.push({ id: "min_age_months", group: "entry", text: `생후 ${r.min_age_months}개월 이상만 입실할 수 있어요.` });
  if (r.max_height_cm) items.push({ id: "max_height_cm", group: "entry", text: `체고 ${r.max_height_cm}cm 이하만 입실할 수 있어요.` });
  for (const f of PET_REQUIREMENT_FLAGS) if (r[f.id]) items.push({ id: f.id, group: f.group, text: f.guest });
  return items;
}

/** 예약할 때 손님이 모두 확인했는지 */
export function missingPetAcks(r: PetRequirements | null | undefined, acks: unknown): string[] {
  const given = Array.isArray(acks) ? acks : [];
  return petRequirementItems(r).filter((i) => !given.includes(i.id)).map((i) => i.id);
}
