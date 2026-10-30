// src/lib/contact.ts
//
// 회원 이름·휴대폰 번호(아이디 찾기 전용) — 입력 정리와 확인을 한곳에서 합니다.
// 저장은 user_contacts 표(본인만 읽고 쓰기, scripts/sql/user-contacts.sql)에 하고,
// 아이디 찾기는 이름 + 번호가 둘 다 맞을 때만 서버(/api/auth/find-id)가 알려 줍니다.

/** "010-1234-5678" → "01012345678"(숫자만) */
export const normalizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 11);

/** 휴대폰 번호 모양인지(010·011·016·017·018·019 + 7~8자리) */
export const isValidPhone = (v: string) => /^01[016789]\d{7,8}$/.test(normalizePhone(v));

/** 입력하면서 보기 좋게 "010-1234-5678" */
export function formatPhone(v: string): string {
  const d = normalizePhone(v);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 이름 정리(앞뒤·가운데 공백 정리) */
export const normalizeName = (v: string) => v.trim().replace(/\s+/g, " ").slice(0, 30);
export const isValidName = (v: string) => normalizeName(v).length >= 2;

/** 아이디 찾기용 안내 문구 — 가입·입력 화면에서 같은 말로 씁니다 */
export const CONTACT_USE_NOTE = "이름과 휴대폰 번호는 아이디(이메일)를 찾을 때만 쓰여요.";
