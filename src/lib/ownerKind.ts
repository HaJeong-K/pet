// src/lib/ownerKind.ts
//
// 사장님 유형 — "가게"(카페·식당·용품점 등)와 "숙소"(펜션·호텔·캠핑장 등)를 나눕니다.
// 사장님 가입·전환 화면에서 버튼으로 고르고(users.owner_kind, scripts/sql/owner-kind.sql),
// 관리자 화면(승인 대기·회원 관리)과 관리자 알림에 유형 표시가 붙습니다.
// 숙소 사장님은 이후 단계에서 객실·동반 규정·예약 달력·예약 요청을 관리하게 됩니다.

export type OwnerKind = "store" | "lodging";

export type OwnerKindInfo = {
  id: OwnerKind;
  /** 버튼·배지에 쓰는 짧은 이름 */
  label: string;
  /** 버튼 아래 설명(줄바꿈 \n) */
  description: string;
  /** 이름 입력칸 제목 — 가게명 / 숙소명 */
  nameLabel: string;
  /** 연락처 입력칸 제목 */
  phoneLabel: string;
  /** 내 업장을 부르는 말 — 내 가게 / 내 숙소 */
  placeWord: string;
  /** 관리자 알림 앞 이모지 */
  emoji: string;
  /** 배지 색 */
  color: string;
  background: string;
};

export const OWNER_KINDS: OwnerKindInfo[] = [
  {
    id: "store",
    label: "가게",
    description: "카페·식당·용품점·미용·병원 등\n반려동물과 함께 들를 수 있는 매장",
    nameLabel: "가게명",
    phoneLabel: "가게 연락처",
    placeWord: "가게",
    emoji: "🏪",
    color: "#A8551F",
    background: "#FBEEDD",
  },
  {
    id: "lodging",
    label: "숙소",
    description: "펜션·호텔·리조트·캠핑장·글램핑 등\n반려동물 동반이 가능한 숙박 시설",
    nameLabel: "숙소명",
    phoneLabel: "숙소 연락처",
    placeWord: "숙소",
    emoji: "🏨",
    color: "#1D4F91",
    background: "#E3EDFA",
  },
];

/** 저장된 값을 유형으로 바꿉니다 — 비어 있거나 모르는 값은 "가게"(유형 구분 전 가입자 포함) */
export function ownerKindOf(value: unknown): OwnerKind {
  return value === "lodging" ? "lodging" : "store";
}

export function ownerKindInfo(value: unknown): OwnerKindInfo {
  const kind = ownerKindOf(value);
  return OWNER_KINDS.find((k) => k.id === kind)!;
}

/** owner_kind 칸이 아직 없어서 난 오류인지(scripts/sql/owner-kind.sql 실행 전) — 그때는 유형 없이 다시 저장합니다 */
export function isMissingOwnerKind(error: { message?: string } | null | undefined): boolean {
  return !!error && /owner_kind/.test(error.message || "");
}

/** 지도 장소 분류가 숙소 계열인지 — 숙소 사장님이 고른 업장이 숙소가 맞는지 확인할 때 씁니다 */
export function isLodgingCategory(category: string | null | undefined): boolean {
  return /숙박|숙소|펜션|호텔|리조트|모텔|민박|게스트|캠핑|글램핑|스테이|풀빌라|한옥/.test(category || "");
}
