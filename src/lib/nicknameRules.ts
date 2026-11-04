// src/lib/nicknameRules.ts
//
// 닉네임에 쓸 수 없는 말 — 사장님·운영진을 사칭하지 못하게 합니다.
// 사장님은 닉네임 대신 "가게명 사장님" 배지(components/OwnerBadge.tsx)로 표시됩니다.
// DB에서도 같은 말을 막습니다(scripts/sql/users-security.sql).

// 관리자 계정은 예외입니다(운영 공지를 "펫츠로드" 이름으로 씀). DB 규칙(guard_users_privileged)과 같은 목록을 유지하세요.
export const RESERVED_NICKNAME_WORDS = ["사장님", "운영진", "운영자", "운영팀", "관리자", "개발자", "펫츠로드", "같이가개", "공식계정", "어드민", "admin", "petsroad", "staff"];
export const RESERVED_NICKNAME_MESSAGE = "'펫츠로드', '운영진', '관리자', '개발자', '사장님'처럼 운영진·사장님으로 오해할 수 있는 닉네임은 쓸 수 없어요.";

export function isReservedNickname(nickname: string, isAdmin = false): boolean {
  if (isAdmin) return false;
  const compact = nickname.replace(/\s+/g, "").toLowerCase();
  return RESERVED_NICKNAME_WORDS.some((word) => compact.includes(word));
}
