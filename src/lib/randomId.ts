// src/lib/randomId.ts
//
// crypto.randomUUID()는 보안 연결(https·localhost)에서만 쓸 수 있어서, 개발 중 휴대폰으로
// http://<PC 내부 IP>:3000 에 접속하면 "crypto.randomUUID is not a function" 오류로 화면이
// 멈췄습니다(비로그인 사용자 키를 처음 만들 때). 쓸 수 있으면 그대로 쓰고, 아니면
// crypto.getRandomValues(보안 연결이 아니어도 동작)로 같은 형식(UUID v4)을 만듭니다.
export function randomId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // 버전 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // 변형 비트
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
