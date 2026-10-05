import { supabase } from "@/lib/supabase";

export async function reportClientError(
  message: string,
  stack: string | null | undefined,
  source: "window.onerror" | "unhandledrejection" | "react-error-boundary"
) {
  // 개발용 컴퓨터(localhost)에서 난 오류는 기록하지 않습니다 — 개발·시험 중에 일부러 낸 오류가
  // 실제 서비스 오류 기록(관리자 "에러 로그", 아침 요약의 오류 건수)에 섞여 들어가던 문제 방지.
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return;
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
