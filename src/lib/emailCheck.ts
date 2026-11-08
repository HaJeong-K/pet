// 이메일 가입 여부 확인 — 서버(/api/auth/email-check)를 거쳐서만 묻습니다(2026-11-08).
// 예전 supabase.rpc("check_email_exists")와 같은 모양({ data, error })으로 돌려줍니다.
export type EmailKind = "none" | "email" | "kakao";

export async function checkEmailExists(email: string): Promise<{ data: EmailKind | null; error: string | null }> {
  try {
    const res = await fetch("/api/auth/email-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: json?.error || "잠시 후 다시 시도해 주세요." };
    return { data: json?.kind ?? "none", error: null };
  } catch {
    return { data: null, error: "인터넷 연결을 확인해 주세요." };
  }
}
