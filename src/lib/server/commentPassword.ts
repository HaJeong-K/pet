// 비회원 후기·답글 비밀번호 — 암호화해서 저장하고, 맞는지는 서버에서만 확인합니다(2026-11-07).
//   예전 글은 비밀번호가 그대로 저장돼 있어 그것도 맞춰 봅니다(맞으면 그 자리에서 암호화로 바꿔 둡니다).

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt$";

export function hashCommentPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 32).toString("hex");
  return `${PREFIX}${salt}$${hash}`;
}

export const isHashed = (stored: string | null | undefined) => !!stored && stored.startsWith(PREFIX);

export function checkCommentPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!isHashed(stored)) {
    const a = Buffer.from(plain), b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const got = scryptSync(plain, salt, 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
