"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";

// 브라우저에서 잡히지 않은 오류(window.onerror)와 처리되지 않은 프라미스 거부
// (unhandledrejection)를 잡아 /api/log-error로 보내는 보이지 않는 전역 리스너.
// layout.tsx에 한 번만 마운트합니다. Sentry 같은 SaaS 없이도 최소한 "실사용자
// 환경에서 무슨 오류가 났는지"를 관리자 페이지(/admin/errors)에서 사후에 확인할 수
// 있게 하는 게 목적입니다.
export default function ErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      reportClientError(event.message, event.error?.stack, "window.onerror");
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      reportClientError(message, stack, "unhandledrejection");
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
