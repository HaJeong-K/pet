import { supabase } from "@/lib/supabase";

export async function reportClientError(
  message: string,
  stack: string | null | undefined,
  source: "window.onerror" | "unhandledrejection" | "react-error-boundary"
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        stack,
        source,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        authUserId: session?.user?.id ?? null,
      }),
    });
  } catch {
    // 에러 리포팅 자체가 실패해도 화면에 아무 영향을 주지 않습니다.
  }
}
