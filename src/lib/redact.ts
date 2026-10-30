// src/lib/redact.ts
//
// 로그에 남기기 전에 공공데이터 인증키를 가립니다. fetch 오류 메시지에는 요청 주소가 통째로 들어 있어,
// 그대로 찍으면 Vercel 빌드·실행 로그에 키가 남습니다.

const SERVICE_KEY = /(serviceKey=)[^&\s"']+/gi;

export function redactSecrets(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : String(value);
  return text.replace(SERVICE_KEY, "$1***");
}
