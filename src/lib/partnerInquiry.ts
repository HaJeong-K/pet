// src/lib/partnerInquiry.ts
//
// 사이트 아래 "광고·제휴 문의"의 입력 규칙(화면과 서버가 같이 씁니다).

export const INQUIRY_KINDS = [
  { id: "ad", label: "광고 문의", hint: "배너 광고, 브랜드·상품 홍보, 지역 캠페인" },
  { id: "partner", label: "제휴 문의", hint: "서비스 연동, 공동 행사, 콘텐츠·데이터 제휴" },
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
  if (!kind) return { error: "문의 종류를 골라 주세요." };
  const name = text(r.name, 30);
  if (!name) return { error: "담당자 이름을 적어 주세요." };
  const contact = text(r.contact, 100);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const digits = contact.replace(/\D/g, "");
  if (!isEmail && !(digits.length >= 9 && digits.length <= 12 && /^[\d\s\-+()]+$/.test(contact))) return { error: "답을 받을 이메일이나 전화번호를 확인해 주세요." };
  const message = typeof r.message === "string" ? r.message.trim().slice(0, INQUIRY_MESSAGE_MAX) : "";
  if (message.length < INQUIRY_MESSAGE_MIN) return { error: `문의 내용을 ${INQUIRY_MESSAGE_MIN}자 이상 적어 주세요.` };
  return { inquiry: { kind, name, company: text(r.company, 60) || null, contact, message } };
}
