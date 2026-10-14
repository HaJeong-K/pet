// src/lib/partnerInquiry.ts
//
// 사이트 아래 "광고·제휴 문의"의 입력 규칙(화면과 서버가 같이 씁니다).
// 광고주·제휴사가 보는 화면이라 안내 문구는 업무 용어로 씁니다(담당자명·회사명·문의 유형·입력·선택).

export const INQUIRY_KINDS = [
  { id: "ad", label: "광고 문의", hint: "지역 배너 광고, 사료·간식·용품 브랜드·상품 홍보, 지역 캠페인" },
  { id: "partner", label: "제휴 문의", hint: "브랜드 협업(체험·샘플 프로모션 등), 기관·서비스 연계, 공동 행사, 데이터 제휴" },
  { id: "etc", label: "기타", hint: "그 밖의 제안" },
] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number]["id"];
export const inquiryKindLabel = (id: string) => INQUIRY_KINDS.find((k) => k.id === id)?.label ?? "기타";

export const INQUIRY_MESSAGE_MAX = 2000;
export const INQUIRY_MESSAGE_MIN = 10;

export type InquiryInput = { kind: InquiryKind; name: string; company: string | null; contact: string; message: string };

/** 입력값을 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function cleanInquiry(raw: unknown): { inquiry: InquiryInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const kind = INQUIRY_KINDS.some((k) => k.id === r.kind) ? (r.kind as InquiryKind) : null;
  if (!kind) return { error: "문의 유형을 선택해 주세요." };
  const name = text(r.name, 30);
  if (!name) return { error: "담당자명을 입력해 주세요." };
  const contact = text(r.contact, 100);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const digits = contact.replace(/\D/g, "");
  if (!isEmail && !(digits.length >= 9 && digits.length <= 12 && /^[\d\s\-+()]+$/.test(contact))) return { error: "회신받을 이메일 또는 전화번호를 확인해 주세요." };
  const message = typeof r.message === "string" ? r.message.trim().slice(0, INQUIRY_MESSAGE_MAX) : "";
  if (message.length < INQUIRY_MESSAGE_MIN) return { error: `문의 내용을 ${INQUIRY_MESSAGE_MIN}자 이상 입력해 주세요.` };
  return { inquiry: { kind, name, company: text(r.company, 60) || null, contact, message } };
}

// ── 관리자가 문의를 관리하는 처리 상태 ──
export const INQUIRY_STATUSES = [
  { id: "new", label: "접수", bg: "#FEF3C7", color: "#92400E" },
  { id: "discuss", label: "협의 필요", bg: "#DBEAFE", color: "#1D4ED8" },
  { id: "progress", label: "진행 중", bg: "#f3f0ff", color: "#7c3aed" },
  { id: "done", label: "완료", bg: "#DCFCE7", color: "#15803D" },
  { id: "rejected", label: "반려", bg: "#FEE2E2", color: "#B91C1C" },
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]["id"];
export const isInquiryStatus = (v: unknown): v is InquiryStatus => INQUIRY_STATUSES.some((s) => s.id === v);
export const inquiryStatus = (id: string) => INQUIRY_STATUSES.find((s) => s.id === id) ?? INQUIRY_STATUSES[0];
/** 더 손댈 일이 없는 상태(완료·반려) — 이 상태가 된 지 1년이 지나면 지웁니다 */
export const isClosedInquiry = (id: string) => id === "done" || id === "rejected";
/** 관리자 메모 글자 수 한도 */
export const INQUIRY_NOTE_MAX = 2000;
