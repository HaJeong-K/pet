// src/lib/nicknameRules.ts
//
// 닉네임에 쓸 수 없는 말 — 사장님·운영진을 사칭하지 못하게 합니다.
// 사장님은 닉네임 대신 "가게명 사장님" 배지(components/OwnerBadge.tsx)로 표시됩니다.
// DB에서도 같은 말을 막습니다(scripts/sql/users-security.sql).

export const RESERVED_NICKNAME_WORDS = ["사장님", "운영진", "관리자", "같이가개"];
export const RESERVED_NICKNAME_MESSAGE = "'사장님', '운영진', '관리자', '같이가개'가 들어간 닉네임은 쓸 수 없어요.";

export function isReservedNickname(nickname: string): boolean {
  const compact = nickname.replace(/\s+/g, "");
  return RESERVED_NICKNAME_WORDS.some((word) => compact.includes(word));
}
