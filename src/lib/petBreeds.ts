// 예약할 때 고르는 견종·묘종 목록 — 국내에서 많이 키우는 순서에 가깝게, 믹스견(말티푸·폼피츠 등) 포함.
// 강아지는 흔한 크기(size)를 함께 적어 두어, 견종을 고르면 크기 칸을 미리 골라 줍니다(손님이 바꿀 수 있음).
// 목록에 없으면 "직접 입력"으로 적습니다. 맹견(동물보호법 시행규칙 5종)은 목록에 넣지 않고 전화 문의 안내를 합니다.

import type { PetSize } from "@/lib/lodgingRules";

export const OTHER_BREED = "직접 입력";

export const DOG_BREEDS: { name: string; size: PetSize }[] = [
  { name: "말티즈", size: "small" }, { name: "푸들(토이)", size: "small" }, { name: "포메라니안", size: "small" }, { name: "치와와", size: "small" },
  { name: "시츄", size: "small" }, { name: "요크셔테리어", size: "small" }, { name: "비숑 프리제", size: "small" }, { name: "닥스훈트", size: "small" },
  { name: "말티푸", size: "small" }, { name: "폼피츠", size: "small" }, { name: "포메푸", size: "small" }, { name: "시츄푸", size: "small" },
  { name: "미니어처 슈나우저", size: "small" }, { name: "미니어처 핀셔", size: "small" }, { name: "파피용", size: "small" }, { name: "페키니즈", size: "small" },
  { name: "퍼그", size: "small" }, { name: "프렌치 불독", size: "medium" }, { name: "웰시코기", size: "medium" }, { name: "비글", size: "medium" },
  { name: "시바견", size: "medium" }, { name: "보더콜리", size: "medium" }, { name: "코카 스패니얼", size: "medium" }, { name: "스피츠", size: "medium" },
  { name: "진돗개", size: "medium" }, { name: "푸들(스탠다드)", size: "large" }, { name: "골든 리트리버", size: "large" }, { name: "래브라도 리트리버", size: "large" },
  { name: "사모예드", size: "large" }, { name: "시베리안 허스키", size: "large" }, { name: "알래스칸 말라뮤트", size: "large" }, { name: "저먼 셰퍼드", size: "large" },
  { name: "버니즈 마운틴 독", size: "large" }, { name: "도베르만", size: "large" },
  { name: "믹스견(소형)", size: "small" }, { name: "믹스견(중형)", size: "medium" }, { name: "믹스견(대형)", size: "large" },
];

export const CAT_BREEDS = [
  "코리안 숏헤어", "러시안 블루", "브리티시 숏헤어", "스코티시 폴드", "페르시안", "먼치킨", "랙돌", "샴", "아메리칸 숏헤어", "노르웨이 숲", "벵갈", "터키시 앙고라", "믹스묘",
];

/** 견종으로 흔한 크기 — 직접 입력이거나 모르면 null */
export const breedSize = (name: string): PetSize | null => DOG_BREEDS.find((b) => b.name === name)?.size ?? null;
