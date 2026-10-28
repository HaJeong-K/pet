// 숙박 예약 동의 항목 — 다른 숙박 예약 앱(야놀자·여기어때 등)과 같은 구성입니다.
// 모두 필수이고, 손님이 동의한 판(STAY_CONSENT_VERSION)과 시각을 예약에 함께 남깁니다(lodging_bookings.consents).
// 문구를 바꾸면 판을 올려 주세요.

export const STAY_CONSENT_VERSION = "2026-10-28";

export type StayConsentId = "rules" | "privacy" | "third_party" | "age14";
export const STAY_CONSENTS: { id: StayConsentId; label: string; detail: string[] }[] = [
  {
    id: "rules",
    label: "숙소 이용 규칙 및 취소·환불 규정 동의",
    detail: [
      "숙소의 반려동물 동반 조건·이용 수칙을 지킵니다.",
      "취소·환불은 공정거래위원회 소비자분쟁해결기준(숙박업)에 따릅니다.",
      "반려동물 정보를 사실과 다르게 적어 입실이 거부되면 당일 취소로 처리됩니다.",
    ],
  },
  {
    id: "privacy",
    label: "개인정보 수집·이용 동의",
    detail: [
      "수집 항목: 예약자 이름·휴대전화·이메일(선택), 이용자 이름·휴대전화, 방문 수단·도착 예정 시각, 반려동물 정보, 요청 사항",
      "이용 목적: 숙박 예약·이용 안내, 예약 확인·변경·취소, 결제·환불, 고객 상담과 분쟁 처리",
      "보유 기간: 전자상거래법에 따라 계약·청약철회·대금결제 기록 5년, 소비자 불만·분쟁 처리 기록 3년",
      "동의하지 않을 수 있으나, 동의하지 않으면 예약할 수 없습니다.",
    ],
  },
  {
    id: "third_party",
    label: "개인정보 제3자(숙소) 제공 동의",
    detail: [
      "제공받는 자: 예약한 숙소",
      "제공 항목: 예약자·이용자 이름과 휴대전화, 방문 수단·도착 예정 시각, 반려동물 정보, 요청 사항",
      "이용 목적: 숙박 서비스 제공, 입실 확인, 이용 관련 연락",
      "보유 기간: 숙박 이용 완료 후 6개월(관계 법령에 보존 의무가 있으면 그 기간)",
      "동의하지 않을 수 있으나, 동의하지 않으면 예약할 수 없습니다.",
    ],
  },
  { id: "age14", label: "만 14세 이상입니다", detail: ["만 14세 미만은 법정대리인의 동의 없이 예약할 수 없습니다."] },
];

export const ARRIVAL_METHODS = [
  { id: "car", label: "차량" },
  { id: "walk", label: "도보·대중교통" },
] as const;
export type ArrivalMethod = (typeof ARRIVAL_METHODS)[number]["id"];

/** 맹견(동물보호법 시행규칙) — 숙소마다 받는 여부가 달라 전화로 먼저 문의해야 합니다 */
export const DANGEROUS_DOG_NOTICE =
  "맹견(도사견·아메리칸 핏불테리어·아메리칸 스태퍼드셔 테리어·스태퍼드셔 불 테리어·로트와일러와 그 잡종)과 함께라면, 반드시 숙소에 전화로 먼저 문의한 뒤 예약해 주세요.";
