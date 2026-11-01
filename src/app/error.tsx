"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";
import { reloadIfStaleDeploy } from "@/lib/staleDeploy";
import ErrorScreen from "@/components/ErrorScreen";

// App Router 라우트 세그먼트 오류 경계 — 렌더링 중 던져진 오류를 잡아 흰 화면
// 대신 재시도 버튼이 있는 화면을 보여주고, 동시에 /api/log-error로 보고합니다.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 새 버전 배포 직후 예전 화면에서 난 "파일을 못 불러옴" 오류는 새로고침으로 바로 해결됩니다.
    if (reloadIfStaleDeploy(error)) return;
    reportClientError(error.message, error.stack, "react-error-boundary");
  }, [error]);

  return <ErrorScreen title="일시적인 오류가 발생했어요" onRetry={reset} />;
}
