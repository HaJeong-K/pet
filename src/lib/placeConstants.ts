// src/lib/placeConstants.ts
//
// 장소 데이터 전반에서 여러 파일이 공유하는 상수·타입 모음입니다.
// 이전에는 "정보없음" 판별 값과 실내외(pet_zone) 라벨이 recommend.ts / affinityScore.ts /
// place/[id]/page.tsx / KakaoMap.tsx 등 여러 곳에 각각 따로 하드코딩되어 있었습니다.
// (심지어 pet_zone 라벨은 파일마다 "실내외 가능" / "실내외 모두 가능"으로 문구까지
// 미묘하게 어긋나 있었습니다.) 값이 하나만 바뀌어도 나머지가 조용히 어긋나는 걸
// 막기 위해 한 곳으로 모았습니다.

/** 공공데이터 반입 시 "정보 없음"을 나타내는 값. petMenu·website 등 여러 필드에서 공통 사용. */
export const NO_INFO_SENTINEL = "정보없음";

/** value가 실제 정보를 담고 있는지(= null도 아니고 NO_INFO_SENTINEL도 아닌지) 판별. */
export function hasInfo(value: string | null | undefined): value is string {
  return !!value && value !== NO_INFO_SENTINEL;
}

export type PetZone = "indoor" | "terrace" | "both";

export const PET_ZONE_LABEL: Record<PetZone, string> = {
  indoor: "실내 가능",
  terrace: "야외 가능",
  both: "실내외 모두 가능",
};

/**
 * place.pet_zone처럼 출처가 느슨한 값(any/string)을 안전하게 라벨로 변환합니다.
 * "indoor"|"terrace"|"both"가 아닌 값이면(공공데이터 원본 표기 등) 원문 그대로 보여주고,
 * 값이 아예 없으면 빈 문자열을 반환합니다.
 * (PET_ZONE_LABEL을 loosely-typed 값으로 직접 인덱싱하면 타입 에러가 나서 이 함수로 감쌌습니다.)
 */
export function getPetZoneLabel(zone: unknown): string {
  if (!zone || typeof zone !== "string") return "";
  return (PET_ZONE_LABEL as Record<string, string>)[zone] ?? zone;
}
